import React, { useState, useCallback, useMemo } from 'react';
import { Spinner } from './Spinner';
import { Dashboard } from './Dashboard';
import { ChatInterface } from './ChatInterface';
import { FaultAnalysis } from './FaultAnalysis';
import { getInitialAnalysisPrompt, getSystemInstruction, canDataQueryTool, modelName } from '../services/geminiService';
import { defaultMatrix } from '../services/defaultMatrix';
import type { CANMessage, ChatMessage } from '../types';
import { SparklesIcon, LineChartIcon, DocumentTextIcon, RefreshCwIcon, ArrowLeftIcon, ListIcon, AlertTriangleIcon } from './IconComponents';
import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';

interface DashboardPageProps {
    initialMessages: CANMessage[];
    initialFiles: File[];
    onGoBack: () => void;
}

const getSignalUnit = (signalName: string | null): string => {
    if (!signalName) return '';
    for (const messageId in defaultMatrix) {
        const messageDef = defaultMatrix[messageId];
        const signalDef = Object.values(messageDef.signals).find(s => s.name === signalName);
        if (signalDef && signalDef.unit) {
            return signalDef.unit;
        }
    }
    return '';
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ initialMessages, initialFiles, onGoBack }) => {
    const [processedMessages] = useState<CANMessage[]>(initialMessages);
    const [chatHistory, setChatHistory] = useState<Content[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [showChart, setShowChart] = useState<boolean>(true);
    const [showFaultReport, setShowFaultReport] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [initialPromptText, setInitialPromptText] = useState<string | null>(null);

    const { allSignals, generatedFaults, timeRange } = useMemo(() => {
        if (processedMessages.length === 0) {
            return { allSignals: [], generatedFaults: [], timeRange: { start: 0, end: 0 } };
        }
        const signals = Array.from(new Set(processedMessages.flatMap(m => m.decoded ? Object.keys(m.decoded) : [])));
    
        const faultSignals = new Set<string>();
        processedMessages.forEach(msg => {
            if (msg.decoded) {
                Object.keys(msg.decoded).forEach(signalName => {
                    if (signalName.toLowerCase().includes('fault')) {
                        faultSignals.add(signalName);
                    }
                });
            }
        });
    
        const faults: string[] = [];
        faultSignals.forEach(signalName => {
            const hasOccurred = processedMessages.some(msg => msg.decoded?.[signalName] === 1);
            if (hasOccurred) {
                faults.push(signalName);
            }
        });
    
        const range = { 
            start: processedMessages[0]?.timestamp ?? 0, 
            end: processedMessages[processedMessages.length - 1]?.timestamp ?? 0 
        };
    
        return { allSignals: signals, generatedFaults: faults, timeRange: range };
    }, [processedMessages]);
    
    const systemInstruction = useMemo(() => {
        return getSystemInstruction(allSignals, generatedFaults, timeRange, processedMessages.length);
    }, [allSignals, generatedFaults, timeRange, processedMessages.length]);

    const chatMessagesForDisplay = useMemo((): ChatMessage[] => {
        return chatHistory
            .filter(content => {
                 const text = content.parts.map(p => p.text ?? '').join('');
                 // Filter out the initial hidden prompt
                 if (content.role === 'user' && text === initialPromptText) {
                     return false;
                 }
                return (content.role === 'user' || content.role === 'model') && content.parts.some(p => p.text)
            })
            .map(content => ({
                role: content.role as 'user' | 'model',
                content: content.parts.map(part => part.text ?? '').join('')
            }));
    }, [chatHistory, initialPromptText]);

    const handleDownloadAnalysis = () => {
        if (chatHistory.length === 0) return;
        const chatLog = chatMessagesForDisplay.map(msg => {
            const prefix = msg.role === 'user' ? '[USER]' : '[AI]';
            return `${prefix}:\n${msg.content}\n`;
        }).join('\n---------------------------------\n');

        const blob = new Blob([chatLog], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const fileName = initialFiles[0]?.name.replace(/\.[^/.]+$/, "") + "_analysis.txt" || "can_analysis.txt";
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const runDataQuery = useCallback((args: { [key: string]: any }): string => {
        const { signal_name, statistic, start_timestamp, end_timestamp } = args;
    
        if (!signal_name) {
            return "Error: A signal name must be provided.";
        }
    
        let messagesInRange = processedMessages;
        if (start_timestamp !== undefined || end_timestamp !== undefined) {
            messagesInRange = processedMessages.filter(m => {
                const ts = Number(m.timestamp);
                const startOk = start_timestamp === undefined || ts >= start_timestamp;
                const endOk = end_timestamp === undefined || ts <= end_timestamp;
                return startOk && endOk;
            });
        }
    
        if (messagesInRange.length === 0) {
            return `No data found for signal '${signal_name}' in the specified time range.`;
        }
    
        const values = messagesInRange
            .map(m => m.decoded?.[signal_name])
            .filter(v => typeof v === 'number' && isFinite(v)) as number[];
    
        if (values.length === 0) {
            return `Signal '${signal_name}' was found, but it contained no numeric values in the specified range.`;
        }
    
        const unit = getSignalUnit(signal_name);
    
        switch (statistic) {
            case 'MAX':
                return `The maximum value for ${signal_name} was ${Math.max(...values).toFixed(4)} ${unit}.`;
            case 'MIN':
                return `The minimum value for ${signal_name} was ${Math.min(...values).toFixed(4)} ${unit}.`;
            case 'AVERAGE':
                const sum = values.reduce((a, b) => a + b, 0);
                return `The average value for ${signal_name} was ${(sum / values.length).toFixed(4)} ${unit}.`;
            case 'COUNT':
                return `There were ${values.length} data points for ${signal_name} in the specified range.`;
            case 'EVENTS':
                 const uniqueValues = [...new Set(values)];
                 if (uniqueValues.length < 10) {
                     return `The signal ${signal_name} changed to these values: ${uniqueValues.join(', ')} ${unit}.`;
                 } else {
                     return `The signal ${signal_name} had ${values.length} data points, changing frequently between ${Math.min(...values).toFixed(4)} and ${Math.max(...values).toFixed(4)} ${unit}.`;
                 }
            default:
                 const firstVal = values[0].toFixed(4);
                 const lastVal = values[values.length - 1].toFixed(4);
                return `Query for ${signal_name} returned ${values.length} points, starting at ${firstVal} and ending at ${lastVal} ${unit}. The average was ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)} ${unit}.`;
        }
    }, [processedMessages]);
    
    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setError(null);

        try {
            // FIX: Use process.env.API_KEY directly as per the coding guidelines.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const initialPrompt = getInitialAnalysisPrompt();
            setInitialPromptText(initialPrompt);

            const initialHistory: Content[] = [{
                role: 'user',
                parts: [{ text: initialPrompt }]
            }];
            
            setChatHistory(initialHistory);
            
            const response = await ai.models.generateContent({
                model: modelName,
                contents: initialHistory,
                config: {
                    systemInstruction,
                    tools: [{ functionDeclarations: [canDataQueryTool] }]
                }
            });
            
            const modelResponsePart = response.candidates?.[0]?.content;
            if (modelResponsePart) {
                setChatHistory(prev => [...prev, modelResponsePart]);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during analysis.';
            setError(`Failed to start analysis. ${errorMessage}`);
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    const handleSendChatMessage = async (message: string) => {
        setIsAnalyzing(true);
        setError(null);

        const newUserContent: Content = { role: 'user', parts: [{ text: message }] };
        
        setChatHistory(prevHistory => {
            const currentHistory = [...prevHistory, newUserContent];
            
            const getResponse = async () => {
                try {
                    // FIX: Use process.env.API_KEY directly as per the coding guidelines.
                    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                    let response = await ai.models.generateContent({
                        model: modelName,
                        contents: currentHistory,
                        config: {
                            systemInstruction,
                            tools: [{ functionDeclarations: [canDataQueryTool] }]
                        }
                    });

                    let modelResponsePart = response.candidates?.[0]?.content;
                    let historyForNextTurn = [...currentHistory];

                    while (modelResponsePart?.parts.some(p => p.functionCall)) {
                        const functionCallPart = modelResponsePart.parts.find(p => p.functionCall)!;
                        const { name, args } = functionCallPart.functionCall!;

                        if (name === 'query_can_data') {
                            const result = runDataQuery(args);
                            
                            historyForNextTurn.push(modelResponsePart);
                            historyForNextTurn.push({
                                role: 'tool',
                                parts: [{ functionResponse: { name, response: { result } } }]
                            });

                            response = await ai.models.generateContent({
                                model: modelName,
                                contents: historyForNextTurn,
                                config: {
                                    systemInstruction,
                                    tools: [{ functionDeclarations: [canDataQueryTool] }]
                                }
                            });
                            modelResponsePart = response.candidates?.[0]?.content;
                        } else {
                            break; 
                        }
                    }

                    if (modelResponsePart) {
                         setChatHistory(prev => [...prev, modelResponsePart]);
                    }
                } catch(err) {
                     const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
                    setError(`Failed to get response. ${errorMessage}`);
                } finally {
                    setIsAnalyzing(false);
                }
            };

            getResponse();
            return currentHistory; 
        });
    }

    const handleResetChat = useCallback(() => {
        setChatHistory([]);
        setInitialPromptText(null);
        setError(null);
    }, []);
    
    return (
        <main style={{
            backgroundColor: 'var(--color-container)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 0 30px -10px var(--color-accent-glow)'
        }}
        className="w-full backdrop-blur-sm rounded-2xl p-6 sm:p-8 space-y-8 animate-fade-in">

            <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="text-2xl font-semibold text-green-400">Processing Successful!</h2>
                <button 
                    onClick={onGoBack} 
                    className="inline-flex items-center justify-center px-4 py-2 border border-gray-500/50 text-sm font-medium rounded-lg shadow-sm text-gray-300 bg-gray-600/20 hover:bg-gray-600/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500 transition-all duration-300"
                >
                    <ArrowLeftIcon className="w-5 h-5 mr-2" />
                    Process New File
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button onClick={() => setShowChart(prev => !prev)} className="w-full inline-flex items-center justify-center px-4 py-2 border border-teal-500/50 text-sm font-medium rounded-lg shadow-sm text-teal-300 bg-teal-600/20 hover:bg-teal-600/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-teal-500 transition-all duration-300 transform hover:scale-105">
                    <LineChartIcon className="w-5 h-5 mr-2" />
                    {showChart ? 'Hide Dashboard' : 'Show Dashboard'}
                </button>
                 <button onClick={() => setShowFaultReport(prev => !prev)} className="w-full inline-flex items-center justify-center px-4 py-2 border border-orange-500/50 text-sm font-medium rounded-lg shadow-sm text-orange-300 bg-orange-600/20 hover:bg-orange-600/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-orange-500 transition-all duration-300 transform hover:scale-105">
                    <ListIcon className="w-5 h-5 mr-2" />
                    {showFaultReport ? 'Hide Fault Report' : 'Show Fault Report'}
                </button>
                {
                    chatHistory.length > 0 ? (
                        <button onClick={handleResetChat} className="w-full inline-flex items-center justify-center px-4 py-2 border border-yellow-500/50 text-sm font-medium rounded-lg shadow-sm text-yellow-300 bg-yellow-600/20 hover:bg-yellow-600/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-yellow-500 transition-all duration-300 transform hover:scale-105">
                            <RefreshCwIcon className="w-5 h-5 mr-2" />
                            Reset Analysis
                        </button>
                    ) : (
                        <button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full inline-flex items-center justify-center px-4 py-2 border border-purple-500/50 text-sm font-medium rounded-lg shadow-sm text-purple-300 bg-purple-600/20 hover:bg-purple-600/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 disabled:bg-gray-600/20 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105">
                            {isAnalyzing ? <Spinner /> : <><SparklesIcon className="w-5 h-5 mr-2" />Start AI Analysis</>}
                        </button>
                    )
                }
            </div>
            
            {showChart && (
                <div className="border-t pt-6 space-y-4 animate-fade-in" style={{ borderColor: 'var(--color-border)'}}>
                    <Dashboard messages={processedMessages} />
                </div>
            )}

             {showFaultReport && (
                 <div className="border-t pt-6 space-y-4 animate-fade-in" style={{ borderColor: 'var(--color-border)'}}>
                    <FaultAnalysis messages={processedMessages} />
                </div>
            )}
            
            {error && (
                <div className="border-t pt-6" style={{ borderColor: 'var(--color-border)'}}>
                    <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative flex items-start" role="alert">
                        <div className="flex-shrink-0">
                             <AlertTriangleIcon className="w-5 h-5 mr-3 mt-0.5"/>
                        </div>
                        <div>
                            <strong className="font-bold">An Error Occurred:</strong>
                            <span className="block text-sm">{error}</span>
                        </div>
                    </div>
                </div>
            )}

            {chatHistory.length > 0 && (
                <div className="border-t pt-6 space-y-4 animate-fade-in" style={{ borderColor: 'var(--color-border)'}}>
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-semibold text-purple-400">AI Analysis Chat</h2>
                        <button
                            onClick={handleDownloadAnalysis}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600/80 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500"
                        >
                            <DocumentTextIcon className="w-4 h-4 mr-2" />
                            Export Chat
                        </button>
                    </div>
                    <ChatInterface 
                        messages={chatMessagesForDisplay}
                        onSendMessage={handleSendChatMessage}
                        isLoading={isAnalyzing}
                    />
                </div>
            )}
        </main>
    );
};