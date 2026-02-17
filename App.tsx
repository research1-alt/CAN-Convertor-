import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Cpu, ArrowLeft, Bluetooth, Zap, Database, LayoutDashboard, LineChart as ChartIcon, ShieldCheck, ShieldAlert, Wifi } from 'lucide-react';
import CANMonitor from '@/components/CANMonitor';
import ConnectionPanel from '@/components/ConnectionPanel';
import LibraryPanel from '@/components/LibraryPanel';
import LiveVisualizerDashboard from '@/components/LiveVisualizerDashboard';
import AuthScreen from '@/components/AuthScreen';
import FeatureSelector from '@/components/FeatureSelector';
import DataDecoder from '@/components/DataDecoder';
import { CANFrame, ConnectionStatus, ConversionLibrary } from '@/types';
import { MY_CUSTOM_DBC, DEFAULT_LIBRARY_NAME } from '@/data/dbcProfiles';
import { normalizeId, formatIdForDisplay } from '@/utils/decoder';
import { User } from '@/services/authService';

const MAX_FRAME_LIMIT = 500000; 
const BATCH_UPDATE_INTERVAL = 40; // Faster updates for live data

const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('osm_currentUser');
    try { return savedUser ? JSON.parse(savedUser) : null; } catch { return null; }
  });
  
  const [view, setView] = useState<'home' | 'select' | 'live' | 'decoder'>('home');
  const [dashboardTab, setDashboardTab] = useState<'link' | 'trace' | 'library' | 'live-visualizer'>('link');
  const [hardwareMode, setHardwareMode] = useState<'esp32-serial' | 'esp32-bt'>('esp32-serial');
  const [frames, setFrames] = useState<CANFrame[]>([]);
  const [latestFrames, setLatestFrames] = useState<Record<string, CANFrame>>({});
  const [bridgeStatus, setBridgeStatus] = useState<ConnectionStatus>('disconnected');
  const [lastErrorMessage, setLastErrorMessage] = useState<string>("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [isElectron, setIsElectron] = useState(false);
  const [library, setLibrary] = useState<ConversionLibrary>({
    id: 'default-pcan-lib',
    name: DEFAULT_LIBRARY_NAME,
    database: MY_CUSTOM_DBC,
    lastUpdated: Date.now(),
  });

  const sessionStartTimeRef = useRef<number>(0);
  const frameMapRef = useRef<Map<string, CANFrame>>(new Map());
  const pendingFramesRef = useRef<CANFrame[]>([]);
  const serialPortRef = useRef<any>(null);
  const keepReadingRef = useRef(false);
  const dataBufferRef = useRef<string>("");

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf(' electron/') > -1) {
      setIsElectron(true);
      console.log("SYS: Desktop Bridge Detected");
    }
  }, []);

  const addDebugLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setDebugLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const processDataChunk = useCallback((chunk: string) => {
    dataBufferRef.current += chunk;
    if (dataBufferRef.current.includes('\n')) {
      const lines = dataBufferRef.current.split('\n');
      dataBufferRef.current = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split('#');
        if (parts.length >= 3) {
          handleNewFrame(parts[0], parseInt(parts[1]), parts[2].split(','));
        }
      }
    }
  }, []);

  const handleNewFrame = (id: string, dlc: number, data: string[]) => {
    const normId = normalizeId(id, true);
    if (!normId) return;
    const prev = frameMapRef.current.get(normId);
    const nowPerf = performance.now();
    const newFrame: CANFrame = {
      id: `0x${formatIdForDisplay(normId)}`, dlc, data: data.map(d => d.toUpperCase().trim()),
      timestamp: nowPerf - sessionStartTimeRef.current, absoluteTimestamp: Date.now(),
      direction: 'Rx', count: (prev?.count || 0) + 1, periodMs: prev ? Math.round(nowPerf - (prev.timestamp + sessionStartTimeRef.current)) : 0
    };
    frameMapRef.current.set(normId, newFrame);
    pendingFramesRef.current.push(newFrame);
  };

  const connectSerial = async () => {
    if (!("serial" in navigator)) { 
      setLastErrorMessage("Browser Block: Web Serial API not found. Please use Chrome or the Windows HUD App.");
      setBridgeStatus('error');
      return; 
    }
    try {
      setLastErrorMessage("");
      setBridgeStatus('connecting');
      addDebugLog("HANDSHAKE: Requesting access to PCAN Tool...");
      
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      
      serialPortRef.current = port;
      sessionStartTimeRef.current = performance.now();
      setBridgeStatus('connected');
      addDebugLog("SUCCESS: Tactical Link Established via Serial.");
      keepReadingRef.current = true;
      
      const reader = port.readable.getReader();
      const decoder = new TextDecoder();
      
      while (keepReadingRef.current) {
        try {
          const { value, done } = await reader.read();
          if (done) break;
          processDataChunk(decoder.decode(value, { stream: true }));
        } catch (readError) {
          console.error("Read Error", readError);
          break;
        }
      }
      reader.releaseLock();
    } catch (err: any) { 
      if (err.name === 'NotFoundError') {
        setLastErrorMessage("CANCELLED: No hardware device was selected.");
        setBridgeStatus('disconnected');
      } else {
        setLastErrorMessage(err.message || "BRIDGE_FAULT: Resource busy or hardware disconnected.");
        setBridgeStatus('error'); 
      }
      addDebugLog(`ERROR: ${err.message}`);
    }
  };

  const connectWebBluetooth = async () => {
    if (!(navigator as any).bluetooth) { 
      setLastErrorMessage("Browser Block: Bluetooth scanning not supported.");
      setBridgeStatus('error');
      return; 
    }
    try {
      setLastErrorMessage("");
      setBridgeStatus('connecting');
      addDebugLog("HANDSHAKE: Scanning for OSM Wireless Bridge...");
      const device = await (navigator as any).bluetooth.requestDevice({ 
        filters: [{ services: [UART_SERVICE_UUID] }],
        optionalServices: [UART_SERVICE_UUID]
      });
      
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(UART_SERVICE_UUID);
      const txChar = await service.getCharacteristic(TX_CHAR_UUID);
      
      await txChar.startNotifications();
      setBridgeStatus('connected');
      sessionStartTimeRef.current = performance.now();
      addDebugLog("SUCCESS: Wireless Link Active.");

      txChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const chunk = new TextDecoder().decode(event.target.value);
        processDataChunk(chunk);
      });
      
      device.addEventListener('gattserverdisconnected', () => {
        setBridgeStatus('disconnected');
        addDebugLog("ALERT: Wireless Link Terminated.");
      });

    } catch (err: any) { 
      if (err.name === 'NotFoundError') {
        setLastErrorMessage("CANCELLED: No Bluetooth device selected.");
        setBridgeStatus('disconnected');
      } else {
        setLastErrorMessage(err.message || "BT_FAULT: Handshake failed.");
        setBridgeStatus('error'); 
      }
      addDebugLog(`ERROR: ${err.message}`);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingFramesRef.current.length > 0) {
        const batch = [...pendingFramesRef.current];
        pendingFramesRef.current = [];
        setFrames(prev => {
          const next = [...prev, ...batch];
          return next.length > MAX_FRAME_LIMIT ? next.slice(-MAX_FRAME_LIMIT) : next;
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
    setUser(u);
  };

  if (!user) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="h-full w-full font-inter flex flex-col min-h-0 overflow-hidden bg-white">
      {view === 'home' ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center bg-white px-6">
          <div className="bg-indigo-600 p-6 rounded-[32px] text-white shadow-2xl mb-12 animate-pulse">
            <Cpu size={64} />
          </div>
          <h1 className="text-4xl md:text-8xl font-orbitron font-black text-slate-900 uppercase text-center">
            OSM <span className="text-indigo-600">LIVE</span>
          </h1>
          <div className="flex flex-col gap-4 w-full max-w-xs mt-12 text-center">
            <button 
              onClick={() => setView('select')} 
              className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-orbitron font-black uppercase shadow-2xl transition-all active:scale-95"
            >
              Enter Deck
            </button>
          </div>
        </div>
      ) : view === 'select' ? (
        <div className="flex-1 w-full overflow-y-auto min-h-0 bg-white">
          <FeatureSelector onSelect={(v) => setView(v)} />
        </div>
      ) : view === 'decoder' ? (
        <div className="flex-1 w-full overflow-hidden min-h-0">
          <DataDecoder library={library} onExit={() => setView('select')} />
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col bg-slate-50 safe-pt overflow-hidden relative min-h-0">
          <header className="h-14 md:h-16 border-b flex items-center justify-between px-4 md:px-6 bg-white shrink-0 z-[100]">
            <div className="flex items-center gap-3 md:gap-4">
              <button onClick={() => setView('select')} className="p-1.5 md:p-2 hover:bg-slate-100 rounded-full transition-colors">
                <ArrowLeft size={18} />
              </button>
              <h2 className="text-[10px] md:text-[12px] font-orbitron font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Wifi size={14} className="text-indigo-600" /> DECK_HUD
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {isElectron && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-orbitron font-black border border-indigo-100">
                  <ShieldCheck size={10} /> DESKTOP_BRIDGE
                </div>
              )}
              {bridgeStatus === 'connected' ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-orbitron font-black border border-emerald-100 animate-pulse">
                  <Zap size={10} /> STREAM_LIVE
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 text-slate-400 rounded-lg text-[8px] font-orbitron font-black border border-slate-100">
                  OFFLINE
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-hidden relative flex flex-col min-h-0">
            {dashboardTab === 'link' ? (
              <ConnectionPanel 
                status={bridgeStatus} 
                errorMessage={lastErrorMessage} 
                hardwareMode={hardwareMode} 
                onSetHardwareMode={setHardwareMode} 
                onConnect={hardwareMode === 'esp32-bt' ? connectWebBluetooth : connectSerial} 
                onDisconnect={() => {
                  keepReadingRef.current = false;
                  setBridgeStatus('disconnected');
                  addDebugLog("ACTION: Manual Link Termination.");
                }} 
                debugLog={debugLog} 
              />
            ) : dashboardTab === 'trace' ? (
              <div className="flex-1 flex flex-col overflow-hidden p-2 md:p-4 min-h-0">
                 <CANMonitor frames={frames} isPaused={false} library={library} onClearTrace={() => setFrames([])} />
              </div>
            ) : dashboardTab === 'live-visualizer' ? (
              <LiveVisualizerDashboard frames={frames} library={library} latestFrames={latestFrames} setSelectedSignalNames={() => {}} />
            ) : (
              <LibraryPanel library={library} onUpdateLibrary={setLibrary} latestFrames={latestFrames} />
            )}
          </main>

          <nav className="h-16 md:h-20 bg-white border-t flex items-center justify-around px-2 md:px-4 pb-1 md:pb-2 shrink-0 safe-pb z-[100]">
            {[
                { id: 'link', icon: Bluetooth, label: 'LINK' },
                { id: 'trace', icon: LayoutDashboard, label: 'TRACE' },
                { id: 'library', icon: Database, label: 'MATRIX' },
                { id: 'live-visualizer', icon: ChartIcon, label: 'VISUAL' }
            ].map(tab => (
                <button 
                  key={tab.id} 
                  onClick={() => setDashboardTab(tab.id as any)} 
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${dashboardTab === tab.id ? 'text-indigo-600 bg-indigo-50 shadow-sm' : 'text-slate-400'}`}
                >
                    <tab.icon size={18} />
                    <span className="text-[7px] md:text-[8px] font-orbitron font-black uppercase tracking-tighter">{tab.label}</span>
                </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
};

export default App;