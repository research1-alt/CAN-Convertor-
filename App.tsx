import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Cpu, ArrowLeft, Activity, Bluetooth, Zap, BarChart3, Database, LayoutDashboard, Send, LineChart as ChartIcon } from 'lucide-react';
import CANMonitor from '@/components/CANMonitor';
import ConnectionPanel from '@/components/ConnectionPanel';
import LibraryPanel from '@/components/LibraryPanel';
import TraceAnalysisDashboard from '@/components/TraceAnalysisDashboard';
import LiveVisualizerDashboard from '@/components/LiveVisualizerDashboard';
import TransmitPanel from '@/components/TransmitPanel';
import AuthScreen from '@/components/AuthScreen';
import FeatureSelector from '@/components/FeatureSelector';
import DataDecoder from '@/components/DataDecoder';
import PWAInstallOverlay from '@/components/PWAInstallOverlay';
import { CANFrame, ConnectionStatus, HardwareStatus, ConversionLibrary, SignalAnalysis, DBCMessage, DBCSignal, TransmitFrame } from '@/types';
import { MY_CUSTOM_DBC, DEFAULT_LIBRARY_NAME } from '@/data/dbcProfiles';
import { normalizeId, formatIdForDisplay, decodeSignal } from '@/utils/decoder';
import { User } from '@/services/authService';
import { analyzeCANData } from '@/services/geminiService';

const MAX_FRAME_LIMIT = 1000000; 
const BATCH_UPDATE_INTERVAL = 60; 
const STALE_SIGNAL_TIMEOUT = 5000; 

// Nordic UART Service UUIDs
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('osm_currentUser');
    try { return savedUser ? JSON.parse(savedUser) : null; } catch { return null; }
  });
  
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem('osm_sid'));
  
  // Navigation
  const [view, setView] = useState<'home' | 'select' | 'live' | 'decoder'>('home');
  const [dashboardTab, setDashboardTab] = useState<'link' | 'trace' | 'library' | 'analysis' | 'live-visualizer' | 'transmit'>('link');
  const [hardwareMode, setHardwareMode] = useState<'esp32-serial' | 'esp32-bt'>('esp32-bt');
  const [frames, setFrames] = useState<CANFrame[]>([]);
  const [latestFrames, setLatestFrames] = useState<Record<string, CANFrame>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDecoded, setIsSavingDecoded] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const hasTriggeredAutoSaveRef = useRef(false);

  const [bridgeStatus, setBridgeStatus] = useState<ConnectionStatus>('disconnected');
  const [hwStatus, setHwStatus] = useState<HardwareStatus>('offline');
  const [baudRate] = useState(115200);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallOverlay, setShowInstallOverlay] = useState(false);

  const [activeSchedules, setActiveSchedules] = useState<Record<string, TransmitFrame>>({});
  const schedulesRef = useRef<Record<string, any>>({});

  const [analysisSelectedSignals, setAnalysisSelectedSignals] = useState<string[]>([]);
  const [visualizerSelectedSignals, setVisualizerSelectedSignals] = useState<string[]>([]);
  const [watcherActive, setWatcherActive] = useState(false);
  const [lastAiAnalysis, setLastAiAnalysis] = useState<(SignalAnalysis & { isAutomatic?: boolean }) | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  const [library, setLibrary] = useState<ConversionLibrary>({
    id: 'default-pcan-lib',
    name: DEFAULT_LIBRARY_NAME,
    database: MY_CUSTOM_DBC,
    lastUpdated: Date.now(),
  });

  const sessionStartTimeRef = useRef<number>(0);
  const frameMapRef = useRef<Map<string, CANFrame>>(new Map());
  const pendingFramesRef = useRef<CANFrame[]>([]);
  const bleBufferRef = useRef<string>("");
  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const serialWriterRef = useRef<any>(null);
  const webBluetoothDeviceRef = useRef<any>(null);
  const bleRxCharacteristicRef = useRef<any>(null);
  const keepReadingRef = useRef(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); setTimeout(() => setShowInstallOverlay(true), 3000); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallOverlay(false);
  };

  const addDebugLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setDebugLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const sendHardwareCommand = async (payload: string) => {
    if (bridgeStatus !== 'connected') return;
    try {
      if (hardwareMode === 'esp32-serial' && serialPortRef.current) {
        if (!serialWriterRef.current) serialWriterRef.current = serialPortRef.current.writable.getWriter();
        await serialWriterRef.current.write(new TextEncoder().encode(payload + "\n"));
      } else if (hardwareMode === 'esp32-bt' && bleRxCharacteristicRef.current) {
        await bleRxCharacteristicRef.current.writeValue(new TextEncoder().encode(payload + "\n"));
      } else if ((window as any).NativeBleBridge) {
        // Assume native bridge handles it
      }
    } catch (e: any) { addDebugLog(`TX_ERROR: ${e.message}`); }
  };

  const handleSendMessage = (id: string, dlc: number, data: string[]) => {
    sendHardwareCommand(`TX#${id}#${dlc}#${data.join(',')}`);
    const normId = normalizeId(id, true);
    pendingFramesRef.current.push({
      id: `0x${formatIdForDisplay(normId)}`, dlc, data: data.map(d => d.toUpperCase()),
      timestamp: performance.now() - sessionStartTimeRef.current, absoluteTimestamp: Date.now(),
      direction: 'Tx', count: 1, periodMs: 0
    });
  };

  const handleScheduleMessage = (frame: TransmitFrame) => {
    setActiveSchedules(prev => ({ ...prev, [frame.id]: frame }));
    if (schedulesRef.current[frame.id]) clearInterval(schedulesRef.current[frame.id]);
    schedulesRef.current[frame.id] = setInterval(() => handleSendMessage(frame.id, frame.dlc, frame.data), frame.periodMs);
  };

  const handleStopMessage = (id: string) => {
    setActiveSchedules(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (schedulesRef.current[id]) { clearInterval(schedulesRef.current[id]); delete schedulesRef.current[id]; }
  };

  const exportFile = async (data: string, fileName: string, mimeType: string = 'text/plain') => {
    const android = (window as any).AndroidInterface;
    if (android) {
        if (android.saveFileWithPicker) android.saveFileWithPicker(data, fileName, mimeType);
        else if (android.saveFile) android.saveFile(data, fileName);
    } else if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: fileName, types: [{ accept: { [mimeType]: [fileName.endsWith('.trc') ? '.trc' : '.csv'] } }] });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch (e) {}
    } else {
      const blob = new Blob([data], { type: mimeType });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
    }
  };

  const handleSaveTrace = async (isAuto: boolean = false) => {
    if (frames.length === 0) return;
    if (!isAuto) setIsSaving(true);
    try {
      const firstFrame = frames[0];
      const startDate = new Date(firstFrame.absoluteTimestamp);
      const excelSerialDate = (startDate.getTime() / (1000 * 60 * 60 * 24)) + 25569.0;
      let content = ";$FILEVERSION=2.0\n";
      content += `;$STARTTIME=${excelSerialDate.toFixed(10)}\n`;
      content += ";$COLUMNS=N,O,T,I,d,l,D\n;\n";
      content += `;   Generated by OSM CAT 1.0 ${isAuto ? '(AUTO)' : ''}\n`;
      content += ";---+-- ------+------ +- --+----- +- +- +- +- -- -- -- -- -- -- --\n";
      const rows = frames.map((f, i) => {
        const idStr = f.id.replace('0x', '').toUpperCase().padStart(8, ' ');
        return `${(i + 1).toString().padStart(7, ' ')} ${(f.timestamp).toFixed(3).padStart(13, ' ')} DT ${idStr} ${f.direction.padStart(2, ' ')} ${f.dlc}  ${f.data.join(' ')}`;
      });
      content += rows.join('\n') + '\n';
      await exportFile(content, `OSM_TRACE_${new Date().getTime()}.trc`);
    } catch (e) { addDebugLog("ERROR: Trace failed."); } finally { if (!isAuto) setIsSaving(false); }
  };
  
  const handleSaveDecoded = async (isAuto: boolean = false) => {
    if (frames.length === 0) return;
    if (!isAuto) setIsSavingDecoded(true);
    try {
      const header = ["timestamp", "signal"].join(",");
      await exportFile(header, `OSM_DECODED_${new Date().getTime()}.csv`, 'text/csv');
    } catch (e) {} finally { if (!isAuto) setIsSavingDecoded(false); }
  };

  const triggerAiAnalysis = async (isAuto = false) => {
    if (frames.length === 0) return;
    setAiLoading(true);
    try {
      const result = await analyzeCANData(frames, user || undefined, sessionId || undefined);
      setLastAiAnalysis({ ...result, isAutomatic: isAuto });
    } catch (e) { addDebugLog("AI_ERROR."); } finally { setAiLoading(false); }
  };

  const handleNewFrame = useCallback((id: string, dlc: number, data: string[]) => {
    if (isPaused) return;
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
  }, [isPaused]);

  const connectSerial = async () => {
    if (!("serial" in navigator)) { addDebugLog("ERROR: No Web Serial."); return; }
    try {
      setBridgeStatus('connecting');
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      serialPortRef.current = port;
      sessionStartTimeRef.current = performance.now();
      setBridgeStatus('connected');
      keepReadingRef.current = true;
      const reader = port.readable.getReader();
      serialReaderRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";
      while (keepReadingRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('\n')) {
          const lines = buffer.split('\n');
          buffer = lines.pop() || "";
          for (const line of lines) {
            const parts = line.trim().split('#');
            if (parts.length >= 3) handleNewFrame(parts[0], parseInt(parts[1]), parts[2].split(','));
          }
        }
      }
    } catch (err: any) { setBridgeStatus('disconnected'); }
  };

  const connectWebBluetooth = async () => {
    if (!(navigator as any).bluetooth) { addDebugLog("ERROR: No Web BT."); return; }
    try {
      setBridgeStatus('connecting');
      const device = await (navigator as any).bluetooth.requestDevice({ filters: [{ services: [UART_SERVICE_UUID] }] });
      webBluetoothDeviceRef.current = device;
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(UART_SERVICE_UUID);
      const txChar = await service.getCharacteristic(TX_CHAR_UUID);
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const chunk = new TextDecoder().decode(event.target.value);
        bleBufferRef.current += chunk;
        if (bleBufferRef.current.includes('\n')) {
            const lines = bleBufferRef.current.split('\n');
            bleBufferRef.current = lines.pop() || "";
            for (const line of lines) {
                const parts = line.trim().split('#');
                if (parts.length >= 3) handleNewFrame(parts[0], parseInt(parts[1]), parts[2].split(','));
            }
        }
      });
      setBridgeStatus('connected');
      sessionStartTimeRef.current = performance.now();
    } catch (err: any) { setBridgeStatus('disconnected'); }
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

  useEffect(() => {
    if (autoSaveEnabled && frames.length >= MAX_FRAME_LIMIT && !hasTriggeredAutoSaveRef.current) {
      hasTriggeredAutoSaveRef.current = true;
      handleSaveTrace(true);
      handleSaveDecoded(true);
    }
  }, [frames.length, autoSaveEnabled]);

  const handleAuthenticated = (u: User, s: string) => {
    localStorage.setItem('osm_currentUser', JSON.stringify(u));
    localStorage.setItem('osm_sid', s);
    setUser(u);
    setSessionId(s);
  };

  if (!user) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="h-full w-full font-inter flex flex-col min-h-0 overflow-hidden bg-white">
      {showInstallOverlay && <PWAInstallOverlay onInstall={handleInstallClick} onDismiss={() => setShowInstallOverlay(false)} />}

      {view === 'home' ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center bg-white px-6 relative overflow-hidden">
          <div className="bg-indigo-600 p-6 rounded-[32px] text-white shadow-2xl mb-12 animate-bounce"><Cpu size={64} /></div>
          <h1 className="text-4xl md:text-8xl font-orbitron font-black text-slate-900 uppercase text-center">OSM <span className="text-indigo-600">LIVE</span></h1>
          <div className="flex flex-col gap-4 w-full max-w-xs mt-12 text-center relative z-10">
            <button onClick={() => setView('select')} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-orbitron font-black uppercase shadow-2xl transition-all active:scale-95">Launch HUD</button>
          </div>
        </div>
      ) : view === 'select' ? (
        <div className="flex-1 w-full overflow-y-auto min-h-0 bg-white"><FeatureSelector onSelect={(v) => setView(v)} /></div>
      ) : view === 'decoder' ? (
        <div className="flex-1 w-full overflow-hidden min-h-0"><DataDecoder library={library} onExit={() => setView('select')} /></div>
      ) : (
        <div className="flex-1 w-full flex flex-col bg-slate-50 safe-pt overflow-hidden relative min-h-0">
          <header className="h-14 md:h-16 border-b flex items-center justify-between px-4 md:px-6 bg-white shrink-0 z-[100]">
            <div className="flex items-center gap-3 md:gap-4">
              <button onClick={() => setView('select')} className="p-1.5 md:p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={18} /></button>
              <h2 className="text-[10px] md:text-[12px] font-orbitron font-black text-slate-900 uppercase">OSM_LINK</h2>
            </div>
            {bridgeStatus === 'connected' && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-orbitron font-black border border-emerald-100"><Zap size={10} /> LIVE</div>
            )}
          </header>

          <main className="flex-1 overflow-hidden relative flex flex-col min-h-0">
            {dashboardTab === 'link' ? (
              <div className="flex-1 overflow-y-auto min-h-0">
                <ConnectionPanel status={bridgeStatus} hardwareMode={hardwareMode} onSetHardwareMode={setHardwareMode} onConnect={hardwareMode === 'esp32-bt' ? connectWebBluetooth : connectSerial} onDisconnect={() => setBridgeStatus('disconnected')} debugLog={debugLog} />
              </div>
            ) : dashboardTab === 'analysis' ? (
              <TraceAnalysisDashboard frames={frames} library={library} latestFrames={latestFrames} selectedSignalNames={analysisSelectedSignals} setSelectedSignalNames={setAnalysisSelectedSignals} watcherActive={watcherActive} setWatcherActive={setWatcherActive} lastAiAnalysis={lastAiAnalysis} aiLoading={aiLoading} onManualAnalyze={() => triggerAiAnalysis(false)} />
            ) : dashboardTab === 'live-visualizer' ? (
              <LiveVisualizerDashboard frames={frames} library={library} latestFrames={latestFrames} selectedSignalNames={visualizerSelectedSignals} setSelectedSignalNames={setVisualizerSelectedSignals} />
            ) : dashboardTab === 'transmit' ? (
              <TransmitPanel onSendMessage={handleSendMessage} onScheduleMessage={handleScheduleMessage} onStopMessage={handleStopMessage} activeSchedules={activeSchedules} />
            ) : dashboardTab === 'trace' ? (
              <div className="flex-1 flex flex-col overflow-hidden p-2 md:p-4 min-h-0">
                 <CANMonitor frames={frames} isPaused={isPaused} library={library} onClearTrace={() => setFrames([])} onSaveTrace={handleSaveTrace} isSaving={isSaving} autoSaveEnabled={autoSaveEnabled} onToggleAutoSave={() => setAutoSaveEnabled(!autoSaveEnabled)} />
              </div>
            ) : (
              <LibraryPanel library={library} onUpdateLibrary={setLibrary} latestFrames={latestFrames} onSaveDecoded={handleSaveDecoded} isSavingDecoded={isSavingDecoded} />
            )}
          </main>

          <nav className="h-16 md:h-20 bg-white border-t flex items-center justify-around px-2 md:px-4 pb-1 md:pb-2 shrink-0 safe-pb z-[100]">
            {[
                { id: 'link', icon: Bluetooth, label: 'LINK' },
                { id: 'trace', icon: LayoutDashboard, label: 'TRACE' },
                { id: 'library', icon: Database, label: 'DATA' },
                { id: 'transmit', icon: Send, label: 'TX' },
                { id: 'live-visualizer', icon: ChartIcon, label: 'GRAPH' },
                { id: 'analysis', icon: BarChart3, label: 'AI' }
            ].map(tab => (
                <button key={tab.id} onClick={() => setDashboardTab(tab.id as any)} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${dashboardTab === tab.id ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
                    <tab.icon size={18} /><span className="text-[7px] md:text-[8px] font-orbitron font-black uppercase tracking-tighter">{tab.label}</span>
                </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
};

export default App;