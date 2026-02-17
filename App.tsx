
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Pause, Cpu, ArrowLeft, Bluetooth, Zap, Terminal, Database, ShieldAlert, LineChart as ChartIcon, Settings2, Trash2 } from 'lucide-react';
import CANMonitor from '@/components/CANMonitor';
import ConnectionPanel from '@/components/ConnectionPanel';
import LibraryPanel from '@/components/LibraryPanel';
import TraceAnalysisDashboard from '@/components/TraceAnalysisDashboard';
import LiveVisualizerDashboard from '@/components/LiveVisualizerDashboard';
import FeatureSelector from '@/components/FeatureSelector';
import { CANFrame, ConnectionStatus, HardwareStatus, ConversionLibrary } from '@/types';
import { MY_CUSTOM_DBC, DEFAULT_LIBRARY_NAME } from '@/data/dbcProfiles';
import { normalizeId, formatIdForDisplay } from '@/utils/decoder';

const MAX_FRAME_LIMIT = 50000;
const BATCH_UPDATE_INTERVAL = 30;

const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'select' | 'live' | 'decoder'>('home');
  const [dashboardTab, setDashboardTab] = useState<'link' | 'trace' | 'library' | 'analysis' | 'live-visualizer'>('link');
  const [hardwareMode, setHardwareMode] = useState<'esp32-serial' | 'esp32-bt'>('esp32-serial');
  
  const [frames, setFrames] = useState<CANFrame[]>([]);
  const [latestFrames, setLatestFrames] = useState<Record<string, CANFrame>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<ConnectionStatus>('disconnected');
  const [hwStatus, setHwStatus] = useState<HardwareStatus>('offline');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  const [library, setLibrary] = useState<ConversionLibrary>({
    id: 'pcan-master-v1',
    name: DEFAULT_LIBRARY_NAME,
    database: MY_CUSTOM_DBC,
    lastUpdated: Date.now(),
  });

  const sessionStartTimeRef = useRef<number>(0);
  const frameMapRef = useRef<Map<string, CANFrame>>(new Map());
  const pendingFramesRef = useRef<CANFrame[]>([]);
  const serialPortRef = useRef<any>(null);

  const addDebugLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setDebugLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  const handleNewFrame = useCallback((id: string, dlc: number, data: string[]) => {
    if (isPaused) return;
    const normId = normalizeId(id, true);
    if (!normId) return;
    const nowPerf = performance.now();
    const prev = frameMapRef.current.get(normId);
    
    const newFrame: CANFrame = {
      id: `0x${formatIdForDisplay(normId)}`,
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

  const connectHardware = async () => {
    try {
      setBridgeStatus('connecting');
      addDebugLog("PCAN_LINK: Initializing Serial Bridge...");
      
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      
      sessionStartTimeRef.current = performance.now();
      setBridgeStatus('connected');
      setHwStatus('active');
      addDebugLog("PCAN_LINK: Bus Live. Streaming data.");

      const reader = port.readable.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";
        for (const line of lines) {
          const parts = line.trim().split('#');
          if (parts.length >= 3) {
            handleNewFrame(parts[0], parseInt(parts[1]), parts[2].split(','));
          }
        }
      }
    } catch (err: any) {
      setBridgeStatus('error');
      addDebugLog(`PCAN_FAULT: ${err.message}`);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingFramesRef.current.length > 0) {
        const batch = [...pendingFramesRef.current];
        pendingFramesRef.current = [];
        setFrames(prev => [...prev, ...batch].slice(-MAX_FRAME_LIMIT));
        const latest: Record<string, CANFrame> = {};
        batch.forEach(f => { latest[normalizeId(f.id.replace('0x',''), true)] = f; });
        setLatestFrames(prev => ({ ...prev, ...latest }));
      }
    }, BATCH_UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 overflow-hidden font-inter text-white">
      {view === 'home' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-32 h-32 bg-indigo-600 rounded-[40px] flex items-center justify-center text-white shadow-2xl mb-12 animate-pulse">
            <Zap size={64} />
          </div>
          <h1 className="text-5xl md:text-8xl font-orbitron font-black uppercase mb-4 tracking-tighter">
            PCAN <span className="text-indigo-500">EXPLORER</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.5em] mb-12">Tactical CAN HUD v8.4</p>
          <button 
            onClick={() => setView('select')}
            className="px-12 py-6 bg-indigo-600 text-white rounded-3xl font-orbitron font-black uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all active:scale-95"
          >
            INITIALIZE LINK
          </button>
        </div>
      ) : view === 'select' ? (
        <FeatureSelector onSelect={(v) => setView(v)} />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('select')} className="text-slate-400 hover:text-white"><ArrowLeft size={20}/></button>
              <h2 className="text-xs font-orbitron font-black text-white uppercase tracking-widest">OSM_PCAN_TERMINAL</h2>
            </div>
            <div className="flex items-center gap-4">
              {hwStatus === 'active' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20 text-[10px] font-black">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div> BUS_CONNECTED
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 flex flex-col overflow-hidden bg-white">
            {dashboardTab === 'link' ? (
              <ConnectionPanel 
                status={bridgeStatus} 
                hardwareMode={hardwareMode} 
                onSetHardwareMode={setHardwareMode} 
                onConnect={connectHardware} 
                onDisconnect={() => {
                  setBridgeStatus('disconnected');
                  setHwStatus('offline');
                }} 
                debugLog={debugLog}
              />
            ) : dashboardTab === 'trace' ? (
              <CANMonitor 
                frames={frames} 
                isPaused={isPaused} 
                library={library} 
                onClearTrace={() => setFrames([])}
              />
            ) : dashboardTab === 'library' ? (
              <LibraryPanel library={library} onUpdateLibrary={setLibrary} latestFrames={latestFrames} />
            ) : dashboardTab === 'live-visualizer' ? (
              <LiveVisualizerDashboard frames={frames} library={library} latestFrames={latestFrames} setSelectedSignalNames={() => {}} />
            ) : (
              <TraceAnalysisDashboard 
                frames={frames} 
                library={library} 
                latestFrames={latestFrames} 
                selectedSignalNames={[]} 
                setSelectedSignalNames={() => {}} 
                watcherActive={true} 
                setWatcherActive={() => {}} 
                lastAiAnalysis={null} 
                aiLoading={false} 
                onManualAnalyze={() => {}} 
              />
            )}
          </main>

          <nav className="h-20 bg-slate-950 border-t border-slate-800 flex items-center justify-around px-4 pb-2">
            {[
              { id: 'link', icon: Bluetooth, label: 'HARDWARE' },
              { id: 'trace', icon: Terminal, label: 'TRACE' },
              { id: 'library', icon: Database, label: 'SIGNALS' },
              { id: 'live-visualizer', icon: ChartIcon, label: 'GRAPH' },
              { id: 'analysis', icon: ShieldAlert, label: 'DIAG' }
            ].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setDashboardTab(tab.id as any)} 
                className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-2xl transition-all ${dashboardTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <tab.icon size={20} />
                <span className="text-[8px] font-orbitron font-black uppercase tracking-tighter">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
};

export default App;
