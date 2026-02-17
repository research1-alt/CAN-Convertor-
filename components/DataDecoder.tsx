import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Upload, Activity, ArrowLeft, Database, ChevronRight, Save, BrainCircuit, Send, Loader2, TrendingUp, ShieldAlert, AlertTriangle, Clock, Battery, XCircle } from 'lucide-react';
import { CANFrame, ConversionLibrary, DBCMessage, DBCSignal } from '../types';
import { parseTrcFile } from '../utils/trcParser';
import { normalizeId, decodeSignal, cleanMessageName } from '../utils/decoder';
import LiveVisualizerDashboard from './LiveVisualizerDashboard';
import { GoogleGenAI } from "@google/genai";

interface DataDecoderProps {
  library: ConversionLibrary;
  onExit: () => void;
}

const ERROR_IDS = ["1038FF50", "18305040"];
const SOC_MSG_DEC_ID = "2418544720"; 
const SOC_SIGNAL_NAME = "State_of_Charger_SOC";

const DataDecoder: React.FC<DataDecoderProps> = ({ library, onExit }) => {
  const [offlineFrames, setOfflineFrames] = useState<CANFrame[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tab, setTab] = useState<'visualizer' | 'diagnostics' | 'data' | 'chat'>('visualizer');
  const [selectedSignals, setSelectedSignals] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [filterStartSoc, setFilterStartSoc] = useState<string>('');
  const [filterEndSoc, setFilterEndSoc] = useState<string>('');
  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const socTimeline = useMemo(() => {
    if (offlineFrames.length === 0) return [];
    const socSig = library.database[SOC_MSG_DEC_ID]?.signals?.[SOC_SIGNAL_NAME];
    if (!socSig) return [];
    return offlineFrames.filter(f => normalizeId(f.id, true) === normalizeId(SOC_MSG_DEC_ID)).map(f => ({
        timestamp: f.timestamp,
        soc: parseFloat(decodeSignal(f.data, socSig))
      })).filter(item => !isNaN(item.soc));
  }, [offlineFrames, library]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const parsed = parseTrcFile(event.target?.result as string);
      setOfflineFrames(parsed);
      setChatHistory([{ role: 'ai', text: `SYS: Log Ingested. ${parsed.length} units ready.` }]);
    };
    reader.readAsText(file);
  };

  const applySocFilter = () => {
    const startSoc = parseFloat(filterStartSoc);
    const endSoc = parseFloat(filterEndSoc);
    if (isNaN(startSoc) || isNaN(endSoc) || socTimeline.length === 0) return;
    const sorted = [...socTimeline].sort((a, b) => a.timestamp - b.timestamp);
    const findT = (target: number) => sorted.reduce((prev, curr) => Math.abs(curr.soc - target) < Math.abs(prev.soc - target) ? curr : prev).timestamp;
    setActiveRange({ start: findT(startSoc), end: findT(endSoc) });
  };

  const filteredFrames = useMemo(() => activeRange ? offlineFrames.filter(f => f.timestamp >= activeRange.start && f.timestamp <= activeRange.end) : offlineFrames, [offlineFrames, activeRange]);
  const latestFramesMap = useMemo(() => {
    const map: Record<string, CANFrame> = {};
    filteredFrames.forEach(f => { map[normalizeId(f.id, true)] = f; });
    return map;
  }, [filteredFrames]);

  const signalStats = useMemo(() => {
    if (filteredFrames.length === 0) return [];
    const statsMap: Record<string, any> = {};
    filteredFrames.slice(0, 10000).forEach(frame => {
      const msg = library.database[Object.keys(library.database).find(k => normalizeId(k) === normalizeId(frame.id, true)) || ""];
      if (msg) {
        Object.values(msg.signals).forEach((sig: DBCSignal) => {
          const val = parseFloat(decodeSignal(frame.data, sig));
          if (!isNaN(val)) {
            if (!statsMap[sig.name]) statsMap[sig.name] = { name: sig.name, min: val, max: val, sum: 0, count: 0 };
            statsMap[sig.name].min = Math.min(statsMap[sig.name].min, val);
            statsMap[sig.name].max = Math.max(statsMap[sig.name].max, val);
            statsMap[sig.name].sum += val;
            statsMap[sig.name].count++;
          }
        });
      }
    });
    return Object.values(statsMap).map((s: any) => ({ ...s, avg: s.sum / s.count }));
  }, [filteredFrames, library]);

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const txt = chatInput; setChatInput(''); setChatHistory(p => [...p, { role: 'user', text: txt }]);
    setChatLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resp = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: `Analyze this log: ${txt}` });
      setChatHistory(p => [...p, { role: 'ai', text: resp.text || "Diagnostic failed." }]);
    } catch { setChatHistory(p => [...p, { role: 'ai', text: "AI link error." }]); } finally { setChatLoading(false); }
  };

  return (
    <div className="h-full w-full flex flex-col bg-white overflow-hidden landscape:flex-row">
      <div className="flex flex-col flex-1 min-h-0">
        <header className="h-16 md:h-20 bg-white border-b flex items-center justify-between px-6 md:px-10 shrink-0 z-[110]">
          <div className="flex items-center gap-4">
            <button onClick={onExit} className="p-2 hover:bg-slate-100 rounded-full transition-all active:scale-95"><ArrowLeft size={24} /></button>
            <div>
              <h2 className="text-sm md:text-2xl font-orbitron font-black text-slate-900 uppercase">OSM_DECODER_PRO</h2>
              <p className="text-[8px] md:text-[12px] text-slate-400 font-bold uppercase tracking-widest hidden sm:block">Windows Desktop Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 px-5 py-3 md:px-8 md:py-4 bg-indigo-600 text-white rounded-2xl text-[10px] md:text-[13px] font-orbitron font-black uppercase shadow-xl hover:bg-indigo-700 cursor-pointer active:scale-95 relative z-[150]">
              <Upload size={18} /> <span>{offlineFrames.length > 0 ? 'NEW_LOG' : 'IMPORT_TRC'}</span>
              <input type="file" accept=".trc,.txt" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
          </div>
        </header>

        {offlineFrames.length > 0 && (
          <div className="bg-slate-900 px-6 py-3 flex flex-wrap items-center gap-4 border-b border-slate-800 shrink-0">
            <Battery size={18} className="text-indigo-400" />
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2">
              <span className="text-[10px] text-slate-500 font-bold uppercase">START_%</span>
              <input type="number" value={filterStartSoc} onChange={e => setFilterStartSoc(e.target.value)} className="bg-transparent border-none text-[12px] text-emerald-400 focus:outline-none w-16" />
            </div>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2">
              <span className="text-[10px] text-slate-500 font-bold uppercase">END_%</span>
              <input type="number" value={filterEndSoc} onChange={e => setFilterEndSoc(e.target.value)} className="bg-transparent border-none text-[12px] text-emerald-400 focus:outline-none w-16" />
            </div>
            <button onClick={applySocFilter} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black active:scale-95">REFILTER</button>
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col bg-slate-50 min-h-0">
          {offlineFrames.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
              <div className="w-32 h-32 bg-white border rounded-[40px] flex items-center justify-center mb-10 shadow-2xl text-indigo-600"><Database size={64} /></div>
              <h3 className="text-4xl font-orbitron font-black text-slate-900 uppercase tracking-widest">DRAG_AND_DROP_LOG</h3>
              <p className="text-slate-400 font-bold uppercase mt-4">Load a PCAN .trc file to begin visual analysis</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <nav className="h-14 bg-white border-b px-10 flex items-center gap-8 shrink-0">
                {['visualizer', 'diagnostics', 'data', 'chat'].map(t => (
                  <button key={t} onClick={() => setTab(t as any)} className={`h-full border-b-4 px-2 text-[11px] font-orbitron font-black uppercase transition-all ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-300'}`}>{t}</button>
                ))}
              </nav>
              <div className="flex-1 overflow-hidden min-h-0">
                {tab === 'visualizer' ? <LiveVisualizerDashboard frames={filteredFrames} library={library} latestFrames={latestFramesMap} selectedSignalNames={selectedSignals} setSelectedSignalNames={setSelectedSignals} isOffline={true} /> : 
                 tab === 'data' ? (
                   <div className="p-10 h-full overflow-y-auto">
                     <div className="grid grid-cols-4 gap-8 mb-10">
                        <div className="bg-white p-8 rounded-3xl border shadow-sm flex flex-col gap-1"><span className="text-[10px] font-black text-slate-400">UNITS</span><span className="text-4xl font-orbitron font-black">{filteredFrames.length.toLocaleString()}</span></div>
                        <div className="bg-white p-8 rounded-3xl border shadow-sm flex flex-col gap-1"><span className="text-[10px] font-black text-slate-400">FAULTS</span><span className="text-4xl font-orbitron font-black text-red-600">0</span></div>
                     </div>
                     <div className="bg-white border rounded-[32px] overflow-hidden">
                       <table className="w-full text-left">
                         <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-black"><tr className="h-16"><th className="px-10">Signal</th><th className="px-10">Min</th><th className="px-10">Max</th><th className="px-10">Avg</th></tr></thead>
                         <tbody className="divide-y font-mono text-[12px]">{signalStats.map(s => <tr key={s.name} className="h-14 hover:bg-slate-50"><td className="px-10 font-bold uppercase">{s.name}</td><td className="px-10 text-emerald-600">{s.min.toFixed(2)}</td><td className="px-10 text-red-600">{s.max.toFixed(2)}</td><td className="px-10 font-black text-indigo-600">{s.avg.toFixed(2)}</td></tr>)}</tbody>
                       </table>
                     </div>
                   </div>
                 ) : null}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DataDecoder;