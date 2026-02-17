import React from 'react';
import { Zap, Cpu, Loader2, Bluetooth, Cable, AlertCircle, Wifi, WifiOff, Monitor, Smartphone, Play } from 'lucide-react';
import { ConnectionStatus } from '../types.ts';

interface ConnectionPanelProps {
  status: ConnectionStatus;
  hardwareMode: 'esp32-serial' | 'esp32-bt' | 'simulator';
  onSetHardwareMode: (mode: 'esp32-serial' | 'esp32-bt' | 'simulator') => void;
  onConnect: () => void;
  onDisconnect: () => void;
  debugLog?: string[];
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ 
  status, 
  hardwareMode,
  onSetHardwareMode,
  onConnect, 
  onDisconnect, 
  debugLog = []
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 animate-in fade-in zoom-in duration-300">
      <div className="w-full max-w-xl bg-slate-900/80 border border-slate-800 rounded-[40px] p-8 md:p-12 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center text-indigo-500 mb-6">
            <Cpu size={32} />
          </div>
          <h3 className="text-2xl font-orbitron font-black text-white uppercase tracking-tight">Bridge_Manager</h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-2">Hardware Interface Selection</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-10">
          {[
            { id: 'esp32-bt', icon: Bluetooth, label: 'Bluetooth' },
            { id: 'esp32-serial', icon: Cable, label: 'Wired USB' },
            { id: 'simulator', icon: Play, label: 'Simulate' }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => onSetHardwareMode(mode.id as any)}
              className={`flex flex-col items-center gap-3 p-5 rounded-3xl border transition-all ${
                hardwareMode === mode.id 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20' 
                  : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-600'
              }`}
            >
              <mode.icon size={20} />
              <span className="text-[8px] font-orbitron font-black uppercase whitespace-nowrap">{mode.label}</span>
            </button>
          ))}
        </div>

        <div className="mb-10 p-6 rounded-3xl bg-slate-800/30 border border-slate-700/50">
          <div className="flex items-center gap-4 mb-3">
            <div className={`p-2 rounded-xl ${status === 'connected' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-700 text-slate-400'}`}>
              {status === 'connected' ? <Wifi size={18} /> : <WifiOff size={18} />}
            </div>
            <div>
              <h4 className="text-[10px] font-orbitron font-black text-slate-300 uppercase tracking-widest">
                {status === 'connected' ? 'LINK_ACTIVE' : status === 'connecting' ? 'HANDSHAKING' : 'IDLE'}
              </h4>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
            {status === 'connected' 
              ? `Operational bridge via ${hardwareMode}. Telemetry processing initiated.` 
              : "Interface standby. Select hardware mode and initiate link to begin decoding."}
          </p>
        </div>

        <button
          onClick={status === 'connected' ? onDisconnect : onConnect}
          disabled={status === 'connecting'}
          className={`w-full py-6 rounded-2xl font-orbitron font-black uppercase tracking-[0.3em] transition-all shadow-xl flex items-center justify-center gap-4 active:scale-95 ${
            status === 'connected' 
              ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' 
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          {status === 'connecting' ? <Loader2 className="animate-spin" size={24} /> : (
            <>
              {status === 'connected' ? 'Terminate_Link' : 'Initiate_Link'}
              <Zap size={20} />
            </>
          )}
        </button>

        {debugLog.length > 0 && (
          <div className="mt-8 pt-8 border-t border-slate-800">
            <h5 className="text-[8px] font-orbitron font-black text-slate-600 uppercase tracking-widest mb-4">Diagnostic_Log</h5>
            <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-2">
              {debugLog.map((log, i) => (
                <div key={i} className="text-[9px] font-mono text-slate-500 flex gap-2">
                  <span className="text-indigo-500 shrink-0">>></span> {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionPanel;