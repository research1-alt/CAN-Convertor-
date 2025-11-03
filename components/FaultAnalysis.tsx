import React, { useMemo } from 'react';
import type { CANMessage } from '../types';
import { AlertTriangleIcon, CheckCircleIcon } from './IconComponents';

interface FaultAnalysisProps {
    messages: CANMessage[];
}

interface AnalysisResult {
    generated: string[];
    notGenerated: string[];
}

export const FaultAnalysis: React.FC<FaultAnalysisProps> = ({ messages }) => {
    const analysisResult = useMemo<AnalysisResult>(() => {
        const faultSignals = new Set<string>();
        messages.forEach(msg => {
            if (msg.decoded) {
                Object.keys(msg.decoded).forEach(signalName => {
                    if (signalName.toLowerCase().includes('fault')) {
                        faultSignals.add(signalName);
                    }
                });
            }
        });

        const generated: string[] = [];
        const notGenerated: string[] = [];

        faultSignals.forEach(signalName => {
            const hasOccurred = messages.some(msg => msg.decoded?.[signalName] === 1);
            if (hasOccurred) {
                generated.push(signalName);
            } else {
                notGenerated.push(signalName);
            }
        });

        return { 
            generated: generated.sort(), 
            notGenerated: notGenerated.sort() 
        };
    }, [messages]);

    const hasFaults = analysisResult.generated.length > 0;
    const hasClearSignals = analysisResult.notGenerated.length > 0;

    return (
        <div className="border rounded-lg p-4 sm:p-6 space-y-6" style={{ backgroundColor: 'rgba(13, 119, 248, 0.03)', borderColor: 'var(--color-border)' }}>
            <h3 className="text-xl font-semibold text-gray-200">Fault Analysis Report</h3>
            
            {!hasFaults && !hasClearSignals && (
                 <p className="text-gray-400 text-center py-4">No signals containing the word "Fault" were found in the data.</p>
            )}

            {hasFaults && (
                <div>
                    <h4 className="font-bold text-lg text-red-400 mb-3">Generated Faults ({analysisResult.generated.length})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {analysisResult.generated.map(signalName => (
                            <div key={signalName} className="flex items-center p-2 rounded-md bg-red-900/40 border border-red-700/60">
                                <AlertTriangleIcon className="w-5 h-5 text-red-400 mr-3 flex-shrink-0" />
                                <span className="text-red-200 font-medium text-sm" title={signalName}>{signalName}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {hasClearSignals && (
                <div>
                    <h4 className="font-bold text-lg text-green-400 mb-3">Clear Signals ({analysisResult.notGenerated.length})</h4>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {analysisResult.notGenerated.map(signalName => (
                            <div key={signalName} className="flex items-center p-2 rounded-md bg-green-900/30 border border-green-700/50">
                                <CheckCircleIcon className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span className="text-green-300 text-sm" title={signalName}>{signalName}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
};
