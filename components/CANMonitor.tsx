import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CANFrame, ConversionLibrary } from '@/types';
import { Terminal, Lock, Unlock, RefreshCw, Loader2, Zap } from 'lucide-react';

interface CANMonitorProps {
  frames: CANFrame[];
  isPaused: boolean;
  library: ConversionLibrary;
  onClearTrace?: () => void;
  onSaveTrace?: () => void;
  isSaving?: boolean;
}

const CANMonitor: React.FC<CANMonitorProps> = ({ 
  frames, 
  isPaused, 
  library,
  onClearTrace, 
  onSaveTrace,
  isSaving = false,
}) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayFrames = useMemo(() => frames.slice(-1000), [frames]);

  useEffect(() => {
    if (autoScroll && !isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayFrames, isPaused, autoScroll]);

  return (
    <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden min-h-0">
      <header className="px-6 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-indigo-600 rounded text-[10px] font-orbitron font-black text-white flex items-center gap-2">
            <Terminal size={12} /> LIVE_TRACE
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            REC: {frames.length} | LIB: {library.name.substring(0, 10)}...
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoScroll(!autoScroll)} className={`p-2 rounded-lg transition-colors ${autoScroll ? 'text-indigo-400 bg-indigo-400/10' : 'text-slate-500 hover:bg-slate-700'}`}>
            {autoScroll ? <Unlock size={16} /> : <Lock size={16} />}
          </button>
          <button onClick={onClearTrace} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-[11px] custom-scrollbar">
        <div className="sticky top-0 bg-slate-950/90 backdrop-blur-sm pb-2 mb-2 border-b border-slate-800/50 text-slate-500 grid grid-cols-[100px_100px_60px_100px_40px_1fr] gap-4">
          <span>TIME_MS</span>
          <span>ID_HEX</span>
          <span>DLC</span>
          <span>DIR</span>
          <span>CNT</span>
          <span>DATA_PAYLOAD</span>
        </div>
        
        <div className="space-y-1">
          {displayFrames.map((f, i) => (
            <div key={i} className="grid grid-cols-[100px_100px_60px_100px_40px_1fr] gap-4 py-1 border-b border-slate-900/50 hover:bg-slate-800/20 transition-colors">
              <span className="text-amber-500/80">{f.timestamp.toFixed(2)}</span>
              <span className="text-indigo-400 font-bold">{f.id}</span>
              <span className="text-slate-500">{f.dlc}</span>
              <span className={f.direction === 'Rx' ? 'text-emerald-500' : 'text-blue-500'}>{f.direction}</span>
              <span className="text-slate-600">{f.count}</span>
              <span className="text-slate-300 tracking-widest">{f.data.join(' ')}</span>
            </div>
          ))}
          {displayFrames.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center py-20 opacity-20 text-center">
              <Zap size={48} className="mb-4" />
              <p className="font-orbitron text-xs tracking-[0.4em] uppercase">Awaiting_Bus_Activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CANMonitor;