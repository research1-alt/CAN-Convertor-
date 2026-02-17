import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Upload, FileText, Activity, BarChart3, Trash2, ArrowLeft, Database, Search, ChevronRight, Save, MessageSquare, BrainCircuit, Send, Loader2, TrendingUp, Info, Zap, PieChart, ShieldAlert, AlertTriangle, Clock, Battery, Filter, XCircle, History, Gauge } from 'lucide-react';
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
const SOC_MSG_DEC_ID = "2418544720"; // Decimal for 0x10281050
const SOC_SIGNAL_NAME = "State_of_Charger_SOC";

const DataDecoder: React.FC<DataDecoderProps> = ({ library, onExit }) => {
  const [offlineFrames, setOfflineFrames] = useState<CANFrame[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tab, setTab] = useState<'visualizer' | 'diagnostics' | 'data' | 'chat'>('visualizer');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSignals, setSelectedSignals] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Filter State
  const [filterStartSoc, setFilterStartSoc] = useState<string>('');
  const [filterEndSoc, setFilterEndSoc] = useState<string>('');
  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);
  
  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Pre-calculate SOC Timeline for filtering
  const socTimeline = useMemo(() => {
    if (offlineFrames.length === 0) return [];
    const socSig = library.database[SOC_MSG_DEC_ID]?.signals?.[SOC_SIGNAL_NAME];
    if (!socSig) return [];

    return offlineFrames
      .filter(f => normalizeId(f.id, true) === normalizeId(SOC_MSG_DEC_ID))
      .map(f => ({
        timestamp: f.timestamp,
        soc: parseFloat(decodeSignal(f.data, socSig))
      }))
      .filter(item => !isNaN(item.soc));
  }, [offlineFrames, library]);

  const availableSocRange = useMemo(() => {
    if (socTimeline.length === 0) return null;
    const values = socTimeline.map(t => t.soc);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [socTimeline]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseTrcFile(content);
      setOfflineFrames(parsed);
      setActiveRange(null);
      setFilterStartSoc('');
      setFilterEndSoc('');
      setChatHistory([{ 
        role: 'ai', 
        text: `MISSION_RECAP: Successfully ingested ${parsed.length.toLocaleString()} tactical units from ${file.name}. SOC metrics mapped. Ready to analyze specific percentage ranges.` 
      }]);
    };
    reader.readAsText(file);
  };

  const applySocFilter = () => {
    const startSoc = parseFloat(filterStartSoc);
    const endSoc = parseFloat(filterEndSoc);
    
    if (isNaN(startSoc) || isNaN(endSoc) || socTimeline.length === 0) return;

    const sortedTimeline = [...socTimeline].sort((a, b) => a.timestamp - b.timestamp);
    
    const findTimeForSoc = (targetSoc: number) => {
      let closest = sortedTimeline[0];
      let minDiff = Math.abs(sortedTimeline[0].soc - targetSoc);
      
      for (const point of sortedTimeline) {
        const diff = Math.abs(point.soc - targetSoc);
        if (diff < minDiff) {
          minDiff = diff;
          closest = point;
        }
      }
      return closest.timestamp;
    };

    const tStart = findTimeForSoc(startSoc);
    const tEnd = findTimeForSoc(endSoc);

    setActiveRange({
      start: Math.min(tStart, tEnd),
      end: Math.max(tStart, tEnd)
    });
  };

  const clearFilter = () => {
    setFilterStartSoc('');
    setFilterEndSoc('');
    setActiveRange(null);
  };

  const filteredFrames = useMemo(() => {
    if (!activeRange) return offlineFrames;
    return offlineFrames.filter(f => f.timestamp >= activeRange.start && f.timestamp <= activeRange.end);
  }, [offlineFrames, activeRange]);

  const dbcLookup = useMemo(() => {
    const map = new Map<string, DBCMessage>();
    if (!library?.database) return map;
    
    (Object.entries(library.database) as [string, DBCMessage][]).forEach(([key, message]) => {
      const normId = normalizeId(key, false); 
      map.set(normId, message);
    });
    return map;
  }, [library]);

  const latestFramesMap = useMemo(() => {
    const map: Record<string, CANFrame> = {};
    filteredFrames.forEach(f => {
      map[normalizeId(f.id, true)] = f;
    });
    return map;
  }, [filteredFrames]);

  const detectedFaults = useMemo(() => {
    const faults: Array<{ timestamp: number, message: string, id: string, type: 'BATT' | 'MCU' }> = [];
    if (filteredFrames.length === 0) return [];
    
    filteredFrames.forEach(f => {
      const normId = normalizeId(f.id, true);
      if (ERROR_IDS.includes(normId)) {
        const message = dbcLookup.get(normId);
        if (message) {
          const signals = Object.values(message.signals) as DBCSignal[];
          signals.forEach(sig => {
            const val = decodeSignal(f.data, sig);
            if (val.trim() === '1') {
              faults.push({
                timestamp: f.timestamp,
                id: f.id,
                message: sig.name.replace(/_/g, ' '),
                type: normId === '1038FF50' ? 'BATT' : 'MCU'
              });
            }
          });
        }
      }
    });

    return faults.sort((a, b) => b.timestamp - a.timestamp);
  }, [filteredFrames, dbcLookup]);

  const signalStats = useMemo(() => {
    if (filteredFrames.length === 0) return [];
    const statsMap: Record<string, { 
      name: string; 
      msgId: string; 
      min: number; 
      max: number; 
      avg: number; 
      count: number; 
      sum: number;
      unit: string;
    }> = {};

    const step = Math.max(1, Math.floor(filteredFrames.length / 10000));
    for (let i = 0; i < filteredFrames.length; i += step) {
      const frame = filteredFrames[i];
      const normId = normalizeId(frame.id, true);
      const message = dbcLookup.get(normId);
      
      if (message) {
        Object.values(message.signals).forEach((sig: DBCSignal) => {
          const valStr = decodeSignal(frame.data, sig);
          const val = parseFloat(valStr);
          if (!isNaN(val)) {
            if (!statsMap[sig.name]) {
              statsMap[sig.name] = { 
                name: sig.name, 
                msgId: normId, 
                min: val, 
                max: val, 
                avg: 0, 
                count: 0, 
                sum: 0,
                unit: sig.unit || ''
              };
            }
            const s = statsMap[sig.name];
            s.min = Math.min(s.min, val);
            s.max = Math.max(s.max, val);
            s.sum += val;
            s.count++;
          }
        });
      }
    }

    return Object.values(statsMap).map(s => ({
      ...s,
      avg: s.sum / s.count
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredFrames, dbcLookup]);

  const handleSaveDecodedData = async () => {
    if (filteredFrames.length === 0) return;
    setIsExporting(true);
    
    setTimeout(async () => {
      try {
        const activeSignalMeta: { name: string; msgId: string; sig: DBCSignal }[] = [];
        const msgIdToSignalNames: Record<string, string[]> = {};

        const frameIdsInLog = new Set(filteredFrames.map(f => normalizeId(f.id.replace('0x', ''), true)));

        (Object.entries(library.database) as [string, DBCMessage][]).forEach(([decKey, msg]) => {
          const normId = normalizeId(decKey);
          if (frameIdsInLog.has(normId)) {
            msgIdToSignalNames[normId] = [];
            Object.values(msg.signals).forEach((sig: DBCSignal) => {
              activeSignalMeta.push({ name: sig.name, msgId: normId, sig });
              msgIdToSignalNames[normId].push(sig.name);
            });
          }
        });

        if (activeSignalMeta.length === 0) {
          alert("No DBC signals identified in this trace. Export aborted.");
          setIsExporting(false);
          return;
        }

        const header = ["Timestamp_ms", ...activeSignalMeta.map(s => `${s.name}_${s.sig.unit || 'raw'}`)].join(",");
        const csvRows: string[] = [header];

        const lastValues: Record<string, string> = {};
        activeSignalMeta.forEach(s => lastValues[s.name] = "0");

        filteredFrames.forEach((frame) => {
          const frameNormId = normalizeId(frame.id.replace('0x', ''), true);
          const signalsInThisMsg = msgIdToSignalNames[frameNormId];

          if (signalsInThisMsg) {
            const dbEntry = library.database[Object.keys(library.database).find(k => normalizeId(k) === frameNormId) || ""];
            if (dbEntry) {
              signalsInThisMsg.forEach(sName => {
                const sig = dbEntry.signals[sName];
                const val = decodeSignal(frame.data, sig);
                lastValues[sName] = val.split(' ')[0];
              });
              const row = [frame.timestamp.toFixed(3), ...activeSignalMeta.map(s => lastValues[s.name])].join(",");
              csvRows.push(row);
            }
          }
        });

        const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.href = url;
        link.download = `OSM_DECODED_EXPORT_${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

      } catch (error) {
        console.error("Export failed:", error);
        alert("Decoded data export failed.");
      } finally {
        setIsExporting(false);
      }
    }, 100);
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userText }]);
    setChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const faultStates = detectedFaults.slice(0, 10).map(f => {
        const nearestSocFrame = filteredFrames.find(fr => 
          normalizeId(fr.id, true) === normalizeId(SOC_MSG_DEC_ID) && 
          Math.abs(fr.timestamp - f.timestamp) < 500
        );
        let socVal = "Unknown";
        if (nearestSocFrame) {
           const socSig = library.database[SOC_MSG_DEC_ID]?.signals?.[SOC_SIGNAL_NAME];
           if (socSig) socVal = decodeSignal(nearestSocFrame.data, socSig);
        }
        return `Fault: ${f.message} at ${f.timestamp.toFixed(2)}ms (Vehicle State: SOC=${socVal})`;
      }).join('\n');

      const statsContext = signalStats.slice(0, 15).map(s => 
        `${s.name}: Min=${s.min}, Max=${s.max}, Avg=${s.avg.toFixed(2)}${s.unit}`
      ).join('\n');

      const prompt = `
        You are the Senior OSM Technical Support Engineer. 
        Mission: Diagnose vehicle behavior from log segment.
        Current Filter Range: ${filterStartSoc}% to ${filterEndSoc}% SOC.
        
        CRITICAL_DATA_SUMMARY:
        - Total Packets in Window: ${filteredFrames.length}
        - Detected Errors in Window: ${detectedFaults.length > 0 ? detectedFaults.length : 'NONE'}
        - Specific Fault Timeline & Correlation:
        ${faultStates || 'No critical fault triggers detected.'}
        
        SIGNAL_RANGES:
        ${statsContext}
        
        INSTRUCTIONS:
        1. Base findings ONLY on the data in the provided SOC window.
        2. Identify specific faults from the timeline.
        3. Correlate faults with state data (like SOC).
        4. Provide actionable engineering insights.
        
        USER_QUERY: "${userText}"
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      setChatHistory(prev => [...prev, { role: 'ai', text: response.text || "Diagnostic link lost." }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "NEURAL_LINK_ERROR: Check system telemetry." }]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  return (
    <div className="h-full w-full flex flex-col bg-white overflow-hidden relative">
      <header className="h-16 md:h-20 bg-white border-b flex items-center justify-between px-4 md:px-8 shrink-0 z-[110] shadow-sm">
        <div className="flex items-center gap-3 md:gap-5 overflow-hidden">
          <button onClick={onExit} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0 active:scale-95">
            <ArrowLeft size={22} className="text-slate-600" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm md:text-xl font-orbitron font-black text-slate-900 uppercase tracking-tight truncate">DATA_DECODER</h2>
            <p className="text-[8px] md:text-[11px] text-slate-400 font-bold uppercase tracking-widest truncate">Mission Analysis Terminal</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {offlineFrames.length > 0 && (
            <button 
              onClick={handleSaveDecodedData}
              disabled={isExporting}
              className={`flex items-center gap-2 px-3 py-2.5 md:px-5 md:py-3 rounded-2xl text-[9px] md:text-[11px] font-orbitron font-black uppercase tracking-widest transition-all shadow active:scale-95 shrink-0 border ${
                isExporting ? 'bg-amber-600 border-amber-700 text-white animate-pulse' : 'bg-white border-slate-200 text-indigo-600'
              }`}
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span className="hidden xs:inline">SAVE</span>
            </button>
          )}

          <label className="flex items-center gap-2 px-4 py-3 md:px-6 md:py-4 bg-indigo-600 text-white rounded-2xl text-[9px] md:text-[11px] font-orbitron font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all cursor-pointer active:scale-95 shrink-0 relative z-[120]">
            <Upload size={16} />
            <span>{offlineFrames.length > 0 ? 'REPLACE' : 'UPLOAD_LOG'}</span>
            <input type="file" accept=".trc,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </header>

      {/* SOC Range Filter Bar - Consistently sized for Mobile */}
      {offlineFrames.length > 0 && (
        <div className="bg-slate-900 px-4 md:px-8 py-3 md:py-5 flex flex-col md:flex-row items-center gap-3 md:gap-6 border-b border-slate-800 z-[105] shrink-0">
          <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
             <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-500/20"><Battery size={18} /></div>
             <div className="flex flex-col min-w-0">
                <span className="text-[9px] md:text-[11px] font-orbitron font-black text-white uppercase tracking-widest truncate">SOC_WINDOW_FILTER</span>
                {availableSocRange && (
                  <span className="text-[8px] font-mono text-indigo-300 uppercase truncate">Range: {availableSocRange.min}%-{availableSocRange.max}%</span>
                )}
             </div>
          </div>
          
          <div className="w-full flex items-center gap-3">
             <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 flex-1">
                <span className="text-[8px] font-orbitron font-black text-slate-500 uppercase">START</span>
                <input 
                  type="number" 
                  value={filterStartSoc}
                  onChange={(e) => setFilterStartSoc(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-mono text-emerald-400 focus:outline-none w-full"
                  placeholder="%"
                />
             </div>
             <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 flex-1">
                <span className="text-[8px] font-orbitron font-black text-slate-500 uppercase">END</span>
                <input 
                  type="number" 
                  value={filterEndSoc}
                  onChange={(e) => setFilterEndSoc(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-mono text-emerald-400 focus:outline-none w-full"
                  placeholder="%"
                />
             </div>
             <button 
                onClick={applySocFilter}
                disabled={socTimeline.length === 0}
                className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-[9px] font-orbitron font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-30 transition-all hover:bg-indigo-500"
             >
                EXECUTE
             </button>
             {activeRange && (
               <button onClick={clearFilter} className="p-3 bg-slate-700 text-slate-300 rounded-xl hover:text-white transition-colors"><XCircle size={18} /></button>
             )}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white">
        {offlineFrames.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-indigo-50 blur-3xl rounded-full scale-150 animate-pulse"></div>
              <div className="w-24 h-24 bg-white border border-slate-100 text-indigo-600 rounded-[32px] flex items-center justify-center relative z-10 shadow-xl">
                <Database size={48} />
              </div>
            </div>
            <h3 className="text-lg md:text-3xl font-orbitron font-black text-slate-900 uppercase tracking-[0.3em] mb-4">AWAITING_TELEMETRY</h3>
            <p className="text-[10px] md:text-[14px] font-bold text-slate-400 uppercase max-w-sm leading-relaxed tracking-wider">
              IMPORT A PCAN-VIEW .TRC LOG FILE USING THE UPLOAD BUTTON ABOVE TO BEGIN TACTICAL DECODING.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <nav className="h-14 md:h-16 bg-white border-b px-2 md:px-8 flex items-center gap-1 md:gap-6 shrink-0 z-[100] overflow-x-auto no-scrollbar">
               {[
                 { id: 'visualizer', label: 'Telemetry_Graphs', icon: Activity },
                 { id: 'diagnostics', label: 'Fault_Engine', icon: ShieldAlert },
                 { id: 'data', label: 'Range_Statistics', icon: TrendingUp },
                 { id: 'chat', label: 'Gemini_Diagnostic', icon: BrainCircuit }
               ].map(t => (
                <button 
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={`flex items-center gap-2 px-4 md:px-6 h-full border-b-4 transition-all whitespace-nowrap group ${tab === t.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-slate-400'}`}
                >
                  <t.icon size={18} />
                  <span className="text-[9px] md:text-[12px] font-orbitron font-black uppercase tracking-wider">{t.label}</span>
                </button>
               ))}
            </nav>

            <div className="flex-1 overflow-hidden relative min-h-0">
              {tab === 'visualizer' ? (
                <LiveVisualizerDashboard 
                  frames={filteredFrames} 
                  library={library} 
                  latestFrames={latestFramesMap} 
                  selectedSignalNames={selectedSignals} 
                  setSelectedSignalNames={setSelectedSignals} 
                  isOffline={true} 
                />
              ) : tab === 'diagnostics' ? (
                <div className="h-full flex flex-col p-4 md:p-10 overflow-y-auto custom-scrollbar bg-slate-50">
                  <div className="max-w-4xl mx-auto w-full space-y-6 md:space-y-12">
                    <header className="flex flex-col gap-2">
                       <h3 className="text-lg md:text-3xl font-orbitron font-black text-slate-900 uppercase flex items-center gap-3 md:gap-6">
                         <ShieldAlert className="text-red-600" size={32} /> FAULT_ENGINE_LOG
                       </h3>
                       <p className="text-[10px] md:text-[14px] text-slate-400 font-bold uppercase tracking-widest">Post-Mission Anomaly Detection</p>
                    </header>
                    {detectedFaults.length === 0 ? (
                      <div className="py-32 flex flex-col items-center justify-center text-center opacity-30">
                        <Zap size={80} className="text-emerald-500 mb-6" />
                        <h4 className="text-sm md:text-2xl font-orbitron font-black uppercase text-emerald-600">All Systems Nominal</h4>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-red-50 border border-red-100 rounded-[32px] p-6 md:p-10 flex items-center justify-between shadow-lg shadow-red-500/5">
                          <div>
                            <p className="text-[9px] md:text-[12px] font-orbitron font-black text-red-400 uppercase tracking-widest mb-1">Detected_Events</p>
                            <p className="text-3xl md:text-6xl font-orbitron font-black text-red-600">{detectedFaults.length}</p>
                          </div>
                          <AlertTriangle size={48} className="text-red-500 opacity-50" />
                        </div>
                        <div className="bg-white border border-slate-200 rounded-[40px] shadow-xl overflow-hidden">
                           <div className="divide-y divide-slate-50">
                              {detectedFaults.map((f, i) => (
                                <div key={i} className="p-6 md:p-8 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                  <div className="flex items-center gap-4 md:gap-6">
                                    <div className={`p-3 md:p-4 rounded-2xl border transition-colors ${f.type === 'BATT' ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-red-100 border-red-200 text-red-700'}`}>
                                      {f.type === 'BATT' ? <Battery size={20} /> : <Zap size={20} />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs md:text-lg font-black text-slate-900 uppercase truncate mb-1">{f.message}</p>
                                      <p className="text-[9px] md:text-[11px] font-mono text-slate-400 uppercase tracking-tighter">TIMESTAMP: {f.timestamp.toFixed(2)}ms | MODULE: {f.type}</p>
                                    </div>
                                  </div>
                                  <ChevronRight size={20} className="text-slate-200" />
                                </div>
                              ))}
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : tab === 'data' ? (
                <div className="h-full flex flex-col p-4 md:p-10 overflow-y-auto custom-scrollbar bg-slate-50">
                  <div className="max-w-6xl mx-auto w-full space-y-6 md:space-y-12 pb-20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                      {[
                        { label: 'Total_Packets', val: filteredFrames.length.toLocaleString(), icon: Zap, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
                        { label: 'Detected_Faults', val: detectedFaults.length, icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
                        { label: 'Mapped_Signals', val: signalStats.length, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                        { label: 'Session_Time', val: `${filteredFrames.length > 0 ? ((filteredFrames[filteredFrames.length-1].timestamp - filteredFrames[0].timestamp) / 1000).toFixed(1) : 0}s`, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' }
                      ].map(card => (
                        <div key={card.label} className={`${card.bg} p-5 md:p-8 rounded-[32px] border flex flex-col gap-4 shadow-sm`}>
                          <div className="flex items-center justify-between">
                            <card.icon size={24} className={card.color} />
                          </div>
                          <div>
                            <p className="text-[8px] md:text-[10px] font-orbitron font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
                            <p className="text-lg md:text-3xl font-orbitron font-black text-slate-900">{card.val}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-[40px] shadow-2xl overflow-hidden">
                      <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full border-collapse font-mono text-[10px] md:text-[12px]">
                          <thead className="bg-slate-900 text-slate-400 text-left border-b border-slate-800">
                            <tr>
                              <th className="px-6 md:px-10 py-5 md:py-8 font-orbitron font-black uppercase tracking-widest text-[9px] md:text-[11px]">SIGNAL_IDENTIFIER</th>
                              <th className="px-4 md:px-8 py-5 md:py-8 font-orbitron font-black uppercase tracking-widest text-[9px] md:text-[11px]">MIN</th>
                              <th className="px-4 md:px-8 py-5 md:py-8 font-orbitron font-black uppercase tracking-widest text-[9px] md:text-[11px]">MAX</th>
                              <th className="px-4 md:px-8 py-5 md:py-8 font-orbitron font-black uppercase tracking-widest text-[9px] md:text-[11px]">AVERAGE</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {signalStats.map(stat => (
                              <tr key={stat.name} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 md:px-10 py-5 md:py-7 font-black text-slate-800 uppercase truncate max-w-[150px] md:max-w-none">{stat.name.replace(/_/g, ' ')}</td>
                                <td className="px-4 md:px-8 py-5 md:py-7 text-emerald-600 font-bold">{stat.min.toFixed(2)}<span className="text-[8px] ml-1 opacity-50">{stat.unit}</span></td>
                                <td className="px-4 md:px-8 py-5 md:py-7 text-red-600 font-bold">{stat.max.toFixed(2)}<span className="text-[8px] ml-1 opacity-50">{stat.unit}</span></td>
                                <td className="px-4 md:px-8 py-5 md:py-7 font-black text-indigo-600">{stat.avg.toFixed(3)}<span className="text-[8px] ml-1 opacity-50">{stat.unit}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col p-4 md:p-12 min-h-0 overflow-hidden bg-slate-50">
                   <div className="bg-white border border-slate-200 rounded-[40px] flex-1 flex flex-col overflow-hidden shadow-2xl relative min-h-0">
                      <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col custom-scrollbar bg-slate-50/50">
                         {chatHistory.map((msg, i) => (
                           <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] md:max-w-[70%] p-5 md:p-8 rounded-[32px] text-xs md:text-sm leading-relaxed shadow-lg ${
                                msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 font-mono whitespace-pre-wrap rounded-tl-none border border-slate-100'
                              }`}>
                                {msg.text}
                              </div>
                           </div>
                         ))}
                         {chatLoading && (
                           <div className="flex justify-start">
                              <div className="bg-white px-6 py-4 rounded-full border border-slate-100 flex items-center gap-3 shadow-md">
                                 <Loader2 size={16} className="animate-spin text-indigo-600" />
                                 <span className="text-[10px] font-orbitron font-black text-slate-400 uppercase tracking-widest">Interpreting_Signal_Log...</span>
                              </div>
                           </div>
                         )}
                         <div ref={chatEndRef} />
                      </div>
                      <div className="p-6 md:p-10 border-t bg-white shrink-0">
                         <form onSubmit={handleChat} className="flex gap-4 max-w-5xl mx-auto">
                            <input 
                              type="text" 
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              placeholder="Query log metrics (e.g. 'Identify cause of battery fault')..."
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-sm font-bold outline-none focus:ring-4 ring-indigo-500/10 transition-all placeholder:text-slate-300"
                            />
                            <button type="submit" disabled={chatLoading || !chatInput.trim()} className="px-8 bg-indigo-600 text-white rounded-2xl active:scale-95 transition-all flex items-center justify-center shadow-xl shadow-indigo-500/20 disabled:opacity-30">
                              <Send size={24} />
                            </button>
                         </form>
                      </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DataDecoder;