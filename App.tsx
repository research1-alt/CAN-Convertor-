import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Pause, Cpu, ArrowLeft, Activity, Bluetooth, Zap, BarChart3, Database, LayoutDashboard, LineChart as ChartIcon, Monitor, Send } from 'lucide-react';
import CANMonitor from '@/components/CANMonitor';
import ConnectionPanel from '@/components/ConnectionPanel';
import LibraryPanel from '@/components/LibraryPanel';
import TraceAnalysisDashboard from '@/components/TraceAnalysisDashboard';
import LiveVisualizerDashboard from '@/components/LiveVisualizerDashboard';
import TransmitPanel from '@/components/TransmitPanel';
import AuthScreen from '@/components/AuthScreen';
import FeatureSelector from '@/components/FeatureSelector';
import DataDecoder from '@/components/DataDecoder';
import { CANFrame, ConnectionStatus, HardwareStatus, ConversionLibrary, SignalAnalysis, TransmitFrame } from '@/types';
import { MY_CUSTOM_DBC, DEFAULT_LIBRARY_NAME } from '@/data/dbcProfiles';
import { normalizeId, formatIdForDisplay } from '@/utils/decoder';
import { User } from '@/services/authService';
import { generateMockPacket } from '@/utils/canSim';
import { analyzeCANData } from '@/services/geminiService';

const MAX_FRAME_LIMIT = 50000; 
const BATCH_UPDATE_INTERVAL = 100; 

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('osm_currentUser');
    try { return savedUser ? JSON.parse(savedUser) : null; } catch { return null; }
  });
  
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem('osm_sid') || 'LOCAL_SESS');
  const [view, setView] = useState<'home' | 'select' | 'live' | 'decoder'>('home');
  const [dashboardTab, setDashboardTab] = useState<'link' | 'trace' | 'library' | 'analysis' | 'live-visualizer' | 'transmit'>('link');
  
  const [hardwareMode, setHardwareMode] = useState<'esp32-serial' | 'esp32-bt' | 'simulator'>('simulator');
  const [frames, setFrames] = useState<CANFrame[]>([]);
  const [latestFrames, setLatestFrames] = useState<Record<string, CANFrame>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<ConnectionStatus>('disconnected');
  const [hwStatus, setHwStatus] = useState<HardwareStatus>('offline');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  const [aiAnalysis, setAiAnalysis] = useState<SignalAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [watcherActive, setWatcherActive] = useState(false);
  const [selectedSignalNames, setSelectedSignalNames] = useState<string[]>([]);

  const simIntervalRef = useRef<any>(null);
  const frameMapRef = useRef<Map<string, CANFrame>>(new Map());
  const pendingFramesRef = useRef<CANFrame[]>([]);
  const sessionStartTimeRef = useRef<number>(performance.now());

  const [library, setLibrary] = useState<ConversionLibrary>({
    id: 'default-pcan-lib',
    name: DEFAULT_LIBRARY_NAME,
    database: MY_CUSTOM_DBC,
    lastUpdated: Date.now(),
  });

  const addDebugLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setDebugLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  const handleManualAnalyze = async () => {
    if (frames.length === 0) return;
    setAiLoading(true);
    try {
      const result = await analyzeCANData(frames, user || undefined, sessionId || undefined);
      setAiAnalysis(result);
      addDebugLog("GEMINI: Analysis update complete.");
    } catch (err) {
      addDebugLog("ERROR: Gemini link failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleNewFrame = useCallback((id: string, dlc: number, data: string[]) => {
    if (isPaused) return;
    const normId = normalizeId(id, true);
    if (!normId) return;
    
    const displayId = `0x${formatIdForDisplay(normId)}`;
    const prev = frameMapRef.current.get(normId);
    const nowPerf = performance.now();
    
    const newFrame: CANFrame = {
      id: displayId, 
      dlc,
      data: data.map(d => d.toUpperCase().trim()), 
      timestamp: nowPerf - sessionStartTimeRef.current,
      absoluteTimestamp: Date.now(),
      direction: 'Rx',
      count: (prev?.count || 0) + 1,
      periodMs: prev ? Math.round(nowPerf - (prev.timestamp + sessionStartTimeRef.current)) : 0
    };
    
    frameMapRef.current.set(normId, newFrame);
    pendingFramesRef.current.push(newFrame);
  }, [isPaused]);

  const startSimulation = useCallback(() => {
    setBridgeStatus('connected');
    setHwStatus('active');
    addDebugLog("SIMULATOR: Generating mock CAN traffic...");
    simIntervalRef.current = setInterval(() => {
      const mock = generateMockPacket(frameMapRef.current, sessionStartTimeRef.current);
      handleNewFrame(mock.id.replace('0x', ''), mock.dlc, mock.data);
    }, 150);
  }, [addDebugLog, handleNewFrame]);

  const stopSimulation = useCallback(() => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    setBridgeStatus('disconnected');
    setHwStatus('offline');
    addDebugLog("SIMULATOR: Stopped.");
  }, [addDebugLog]);

  const handleConnect = () => {
    if (hardwareMode === 'simulator') {
      startSimulation();
    } else {
      setBridgeStatus('connecting');
      setTimeout(() => {
        setBridgeStatus('connected');
        setHwStatus('active');
        addDebugLog("BRIDGE: Linked to ESP32 Hardware.");
      }, 1000);
    }
  };

  const handleDisconnect = () => {
    if (hardwareMode === 'simulator') {
      stopSimulation();
    } else {
      setBridgeStatus('disconnected');
      setHwStatus('offline');
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingFramesRef.current.length > 0) {
        const batch = [...pendingFramesRef.current];
        pendingFramesRef.current = [];
        
        setFrames(prev => {
          const next = [...prev, ...batch];
          return next.slice(-MAX_FRAME_LIMIT);
        });
        
        const latest: Record<string, CANFrame> = {};
        batch.forEach(f => { latest[normalizeId(f.id.replace('0x',''), true)] = f; });
        setLatestFrames(prev => ({ ...prev, ...latest }));
      }
    }, BATCH_UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const handleAuthenticated = (u: User, s: string) => {
    localStorage.setItem('osm_currentUser', JSON.stringify(u));
    localStorage.setItem('osm_sid', s);
    setUser(u);
    setSessionId(s);
  };

  if (!user) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 font-inter overflow-hidden">
      {view === 'home' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center shadow-2xl shadow-indigo-500/20 mb-8 animate-pulse">
            <Cpu size={48} className="text-white" />
          </div>
          <h1 className="text-6xl font-orbitron font-black tracking-tighter mb-4">OSM <span className="text-indigo-500">LIVE</span></h1>
          <p className="text-slate-400 font-orbitron text-xs tracking-[0.4em] mb-12 uppercase">Tactical PCAN Interface v1.0</p>
          <button 
            onClick={() => setView('select')}
            className="px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-orbitron font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"
          >
            Initiate System
          </button>
        </div>
      ) : view === 'select' ? (
        <FeatureSelector onSelect={(v) => setView(v)} />
      ) : view === 'decoder' ? (
        <DataDecoder library={library} onExit={() => setView('select')} />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('select')} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400"><ArrowLeft size={20} /></button>
              <div className="flex flex-col">
                <span className="text-[10px] font-orbitron font-black text-indigo-500 uppercase tracking-widest">OSM_LIVE_LINK</span>
                <span className="text-[8px] font-mono text-slate-500 uppercase">{hwStatus === 'active' ? 'STREAM_LIVE' : 'LINK_IDLE'}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {bridgeStatus === 'connected' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-orbitron font-black border border-emerald-500/20">
                  <Activity size={12} className="animate-pulse" /> ACTIVE_LINK
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-mono text-slate-400">
                BUFF: {frames.length.toLocaleString()}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-hidden relative">
            {dashboardTab === 'link' && (
              <ConnectionPanel 
                status={bridgeStatus} 
                hardwareMode={hardwareMode} 
                onSetHardwareMode={setHardwareMode as any} 
                onConnect={handleConnect} 
                onDisconnect={handleDisconnect} 
                debugLog={debugLog}
              />
            )}
            {dashboardTab === 'trace' && (
              <div className="h-full p-4 flex flex-col gap-4">
                <CANMonitor 
                  frames={frames} 
                  isPaused={isPaused} 
                  library={library} 
                  onClearTrace={() => setFrames([])}
                />
              </div>
            )}
            {dashboardTab === 'library' && (
              <LibraryPanel library={library} onUpdateLibrary={setLibrary} latestFrames={latestFrames} />
            )}
            {dashboardTab === 'analysis' && (
              <TraceAnalysisDashboard 
                frames={frames} 
                library={library} 
                latestFrames={latestFrames} 
                selectedSignalNames={selectedSignalNames}
                setSelectedSignalNames={setSelectedSignalNames}
                watcherActive={watcherActive}
                setWatcherActive={setWatcherActive}
                lastAiAnalysis={aiAnalysis}
                aiLoading={aiLoading}
                onManualAnalyze={handleManualAnalyze}
              />
            )}
            {dashboardTab === 'live-visualizer' && (
              <LiveVisualizerDashboard 
                frames={frames} 
                library={library} 
                latestFrames={latestFrames} 
                setSelectedSignalNames={setSelectedSignalNames}
              />
            )}
            {dashboardTab === 'transmit' && (
              <TransmitPanel 
                onSendMessage={() => {}} 
                onScheduleMessage={() => {}} 
                onStopMessage={() => {}} 
                activeSchedules={{}} 
              />
            )}
          </main>

          <nav className="h-20 bg-slate-900 border-t border-slate-800 flex items-center justify-around px-4 shrink-0">
            {[
              { id: 'link', icon: Bluetooth, label: 'Link' },
              { id: 'trace', icon: LayoutDashboard, label: 'Trace' },
              { id: 'library', icon: Database, label: 'Data' },
              { id: 'live-visualizer', icon: ChartIcon, label: 'Graph' },
              { id: 'analysis', icon: BarChart3, label: 'AI' }
            ].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setDashboardTab(tab.id as any)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${dashboardTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <tab.icon size={20} />
                <span className="text-[8px] font-orbitron font-black uppercase">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
};

export default App;