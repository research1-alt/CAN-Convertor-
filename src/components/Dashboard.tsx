


import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
  TooltipModel,
  ScaleOptions,
  Scale,
  ChartEvent,
  ActiveElement,
  Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import type { CANMessage } from '../types';
import { ChevronDownIcon, MaximizeIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, DownloadIcon, CameraIcon, InfoIcon } from './IconComponents';
import { defaultMatrix } from '../services/defaultMatrix';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin,
  Filler
);

interface DashboardProps {
    messages: CANMessage[];
}

const COLORS = [
    '#0284c7', '#5f57be', '#d946ef', '#e11d48', '#ea580c', '#f59e0b',
    '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#f97316', '#facc15'
];

const calculateStats = (data: number[]) => {
    if (data.length === 0) return { min: NaN, max: NaN, avg: NaN, rms: NaN, std: NaN, delta: NaN };

    const cleanData = data.filter(v => v !== null && !isNaN(v));
    if (cleanData.length === 0) return { min: NaN, max: NaN, avg: NaN, rms: NaN, std: NaN, delta: NaN };

    const sum = cleanData.reduce((acc, val) => acc + val, 0);
    const avg = sum / cleanData.length;
    const min = Math.min(...cleanData);
    const max = Math.max(...cleanData);
    const delta = max - min;
    const rms = Math.sqrt(cleanData.reduce((acc, val) => acc + val * val, 0) / cleanData.length);
    const std = Math.sqrt(cleanData.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / cleanData.length);

    return { min, max, avg, rms, std, delta };
};

const formatStatValue = (value: number, precision = 6) => isNaN(value) ? 'N/A' : value.toFixed(precision);

const StatRow: React.FC<{ label: string; value: string | number; unit?: string }> = ({ label, value, unit }) => (
    <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 items-center text-xs">
        <span className="text-gray-500 truncate" title={label}>{label}</span>
        <span className="font-mono text-gray-800 text-right">{value}</span>
        <span className="text-gray-500 w-12 text-left pl-1">{unit || ''}</span>
    </div>
);

const AccordionItem: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border border-gray-200 rounded-md bg-white">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-2 font-bold text-xs hover:bg-gray-100 transition-colors"
            >
                <span>{title}</span>
                <ChevronDownIcon className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="p-2 border-t border-gray-200 space-y-1">{children}</div>}
        </div>
    );
};


const findClosestIndex = (timestamp: number, messages: CANMessage[]): number => {
    if (!messages || messages.length === 0) return -1;
    let low = 0;
    let high = messages.length - 1;

    if (timestamp <= Number(messages[0].timestamp)) return 0;
    if (timestamp >= Number(messages[high].timestamp)) return high;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midTime = Number(messages[mid].timestamp);

        if (midTime < timestamp) {
            low = mid + 1;
        } else if (midTime > timestamp) {
            high = mid - 1;
        } else {
            return mid; // Exact match
        }
    }
    if (high < 0) high = 0;
    if (low >= messages.length) low = messages.length - 1;
    
    const diffHigh = Math.abs(Number(messages[high].timestamp) - timestamp);
    const diffLow = Math.abs(Number(messages[low].timestamp) - timestamp);

    return diffLow < diffHigh ? low : high;
};

interface SignalStats {
    min: number;
    max: number;
    avg: number;
    rms: number;
    std: number;
    delta: number;
}

interface RangeStats {
    signals: Record<string, SignalStats>;
    t1: string;
    t2: string;
    dt: number;
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

const MAX_POINTS_TO_DISPLAY = 50000; // Threshold for downsampling

export const Dashboard: React.FC<DashboardProps> = ({ messages }) => {
    const chartRef = useRef<ChartJS<'line'>>(null);
    const chartRefs = useRef<Map<string, ChartJS<'line'>>>(new Map());
    const zoomStateRef = useRef<{ min: number; max: number } | null>(null);
    const isCtrlPressedRef = useRef(false);
    
    const [selectedSignals, setSelectedSignals] = useState<Set<string>>(new Set());
    const [lineMode, setLineMode] = useState<'stepped' | 'linear'>('stepped');
    const [manualYAxesLimits, setManualYAxesLimits] = useState<Record<string, { min?: number; max?: number }>>({});
    const [autoYAxesLimits, setAutoYAxesLimits] = useState<Record<string, { min?: number; max?: number }>>({});
    
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [editingSignal, setEditingSignal] = useState<string | null>(null);
    const [tempLimits, setTempLimits] = useState<{ min: string; max: string }>({ min: '', max: '' });

    const [cursorStats, setCursorStats] = useState<{ timestamp: string, values: Record<string, string> } | null>(null);
    const [selectedRangeStats, setSelectedRangeStats] = useState<RangeStats | null>(null);
    const [visibleRangeStats, setVisibleRangeStats] = useState<RangeStats | null>(null);
    const [overallStats, setOverallStats] = useState<{ t1: string, t2: string } | null>(null);

    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selection, setSelection] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
    const dragStartRef = useRef<{ timestamp: number; selectionStart: number; selectionEnd: number; } | null>(null);

    const [draggingMode, setDraggingMode] = useState<'start' | 'end' | 'range' | null>(null);
    const [hoveringMode, setHoveringMode] = useState<'start' | 'end' | 'range' | null>(null);


    const [viewMode, setViewMode] = useState<'overlay' | 'stacked'>('overlay');
    const [soloSignal, setSoloSignal] = useState<string | null>(null);

    const relevantMessages = useMemo(() => messages.filter(m => m.decoded && Object.keys(m.decoded).length > 0), [messages]);

    const isDataDownsampled = relevantMessages.length > MAX_POINTS_TO_DISPLAY;

    const downsampledMessages = useMemo(() => {
        if (!isDataDownsampled) {
            return relevantMessages;
        }
        const sampled = [];
        const totalPoints = relevantMessages.length;
        const step = Math.ceil(totalPoints / MAX_POINTS_TO_DISPLAY);
        for (let i = 0; i < totalPoints; i += step) {
            sampled.push(relevantMessages[i]);
        }
        return sampled;
    }, [relevantMessages, isDataDownsampled]);

    const allSignals = useMemo(() => {
        const signalNames = new Set<string>();
        relevantMessages.forEach(msg => {
            if (msg.decoded) {
                Object.keys(msg.decoded).forEach(signalName => {
                    signalNames.add(signalName);
                });
            }
        });
        return Array.from(signalNames).sort();
    }, [relevantMessages]);
    
    const signalsToRender = useMemo(() => {
        return soloSignal ? [soloSignal] : Array.from(selectedSignals);
    }, [soloSignal, selectedSignals]);
    
    const statsSignal = useMemo(() => {
        if (soloSignal) return soloSignal;
        if (signalsToRender.length > 0) return signalsToRender[0];
        return null;
    }, [soloSignal, signalsToRender]);
    
    const statsSignalUnit = useMemo(() => getSignalUnit(statsSignal), [statsSignal]);


    const getActiveChart = useCallback((): ChartJS<'line'> | null | undefined => {
        if (viewMode === 'overlay') return chartRef.current;
        if (signalsToRender.length > 0) return chartRefs.current.get(signalsToRender[0]);
        return null;
    }, [viewMode, signalsToRender]);

    useEffect(() => {
        setViewMode('overlay');
        setSoloSignal(null);
        if (chartRef.current) chartRef.current.resetZoom('none');
        chartRefs.current.forEach(c => c?.resetZoom('none'));
        zoomStateRef.current = null;
        setManualYAxesLimits({});
        setAutoYAxesLimits({});
        setOverallStats(null);
        setSelectedRangeStats(null);
        setVisibleRangeStats(null);
        setCursorStats(null);
        setSelection({ start: null, end: null });
        setIsSelectMode(false);
        if (allSignals.length > 0) {
            setSelectedSignals(new Set(allSignals.slice(0, 2)));
        } else {
            setSelectedSignals(new Set());
        }
    }, [messages, allSignals]);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'r') {
                setIsSelectMode(prev => !prev);
            } else if (e.key.toLowerCase() === 's') {
                setViewMode(prev => (prev === 'overlay' ? 'stacked' : 'overlay'));
                setSoloSignal(null); // Exit solo mode when switching views
            } else if (e.key === 'Escape') {
                setIsSelectMode(false);
                setSelection({ start: null, end: null });
                setSelectedRangeStats(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
          if (e.key === 'Control' && !e.repeat) {
            isCtrlPressedRef.current = true;
            const chart = getActiveChart();
            if (chart?.canvas) {
                chart.canvas.style.cursor = 'crosshair';
            }
          }
        };
        const handleKeyup = (e: KeyboardEvent) => {
          if (e.key === 'Control') {
            isCtrlPressedRef.current = false;
            const chart = getActiveChart();
            if(chart) {
                chart.tooltip.setActiveElements([], {x:0, y:0});
                chart.update('none');
                let cursor = 'default';
                 if (isSelectMode) {
                    switch(hoveringMode) {
                        case 'start':
                        case 'end':
                            cursor = 'ew-resize'; break;
                        case 'range':
                            cursor = 'move'; break;
                        default:
                            cursor = 'crosshair';
                    }
                }
                chart.canvas.style.cursor = cursor;
            }
            setCursorStats(null);
          }
        };
        window.addEventListener('keydown', handleKeydown);
        window.addEventListener('keyup', handleKeyup);
        return () => {
          window.removeEventListener('keydown', handleKeydown);
          window.removeEventListener('keyup', handleKeyup);
        };
    }, [getActiveChart, hoveringMode, isSelectMode]);

    const calculateAndSetStats = useCallback((startIndex: number, endIndex: number): RangeStats | null => {
        if (startIndex > endIndex || startIndex === -1 || endIndex === -1) return null;
        const statsBySignal: Record<string, SignalStats> = {};

        for (const signal of selectedSignals) {
            const rangeData = relevantMessages.slice(startIndex, endIndex + 1).map(m => m.decoded?.[signal]).filter(v => v !== undefined && v !== null) as number[];
            statsBySignal[signal] = calculateStats(rangeData);
        }

        const t1 = relevantMessages[startIndex]?.timestamp;
        const t2 = relevantMessages[endIndex]?.timestamp;
        const dt = (typeof t1 === 'number' && typeof t2 === 'number') ? (t2 - t1) : NaN;

        return {
            signals: statsBySignal,
            t1: typeof t1 === 'number' ? t1.toFixed(6) : String(t1 || ''),
            t2: typeof t2 === 'number' ? t2.toFixed(6) : String(t2 || ''),
            dt: dt,
        };
    }, [relevantMessages, selectedSignals]);

    // FIX: Separated overall stats calculation to prevent re-render loops.
    useEffect(() => {
        if (relevantMessages.length > 0) {
            const firstT = relevantMessages[0].timestamp;
            const lastT = relevantMessages[relevantMessages.length - 1].timestamp;
            setOverallStats({
                t1: typeof firstT === 'number' ? firstT.toFixed(6) : String(firstT),
                t2: typeof lastT === 'number' ? lastT.toFixed(6) : String(lastT),
            });
        } else {
            setOverallStats(null);
        }
    }, [relevantMessages]);

    const updateStatsPanels = useCallback((chartArg?: ChartJS<'line'> | null) => {
        const chart = chartArg || getActiveChart();
        if (!chart || relevantMessages.length === 0) return;

        const { min: minTimestamp, max: maxTimestamp } = chart.scales.x;
        const startIndex = findClosestIndex(minTimestamp, relevantMessages);
        const endIndex = findClosestIndex(maxTimestamp, relevantMessages);
        
        const finalStartIndex = startIndex === -1 ? 0 : startIndex;
        const finalEndIndex = endIndex === -1 ? relevantMessages.length - 1 : endIndex;

        if (finalStartIndex <= finalEndIndex && relevantMessages.length > 0) {
            const visibleStats = calculateAndSetStats(finalStartIndex, finalEndIndex);
            setVisibleRangeStats(visibleStats);
        } else {
            setVisibleRangeStats(null);
        }
    }, [relevantMessages, calculateAndSetStats, getActiveChart]);


    useEffect(() => {
        const timeoutId = setTimeout(() => updateStatsPanels(), 100);
        return () => clearTimeout(timeoutId);
    }, [signalsToRender, viewMode, updateStatsPanels]);

    const syncCharts = (initiatingChart: ChartJS, min: number, max: number) => {
        chartRefs.current.forEach((chartInstance) => {
            if (chartInstance && chartInstance.id !== initiatingChart.id) {
                chartInstance.options.scales!.x!.min = min;
                chartInstance.options.scales!.x!.max = max;
                chartInstance.update('none');
            }
        });
    };

    const handleZoomComplete = useCallback(({ chart }: { chart: ChartJS<'line'> }) => {
        if (!chart.scales.x) return;
        const { min, max } = chart.scales.x;
        zoomStateRef.current = { min, max };
        if (viewMode === 'stacked') syncCharts(chart, min, max);
    
        const startIndex = findClosestIndex(min, relevantMessages);
    const endIndex = findClosestIndex(max, relevantMessages);
    
    const newAutoLimits: Record<string, { min: number; max: number }> = {};
    if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
        const visibleMessages = relevantMessages.slice(startIndex, endIndex + 1);
        
        signalsToRender.forEach(signalName => {
            const values = visibleMessages.map(m => m.decoded?.[signalName]).filter(v => typeof v === 'number' && isFinite(v)) as number[];
            if (values.length > 0) {
                const minY = Math.min(...values);
                const maxY = Math.max(...values);
                const range = maxY - minY;
                const padding = range > 0 ? range * 0.05 : 0.1;
                newAutoLimits[signalName] = { min: minY - padding, max: maxY + padding };
            }
        });
    }
    
    setAutoYAxesLimits(currentLimits => {
        if (JSON.stringify(currentLimits) !== JSON.stringify(newAutoLimits)) {
            return newAutoLimits;
        }
        return currentLimits;
    });

    updateStatsPanels(chart);
}, [relevantMessages, signalsToRender, viewMode, updateStatsPanels]);
    
    const handlePanComplete = useCallback(({ chart }: { chart: ChartJS<'line'> }) => {
        if (!chart.scales.x) return;
        const { min, max } = chart.scales.x;
        zoomStateRef.current = { min, max };
        if (viewMode === 'stacked') syncCharts(chart, min, max);

        const newManualLimits = { ...manualYAxesLimits };
        Object.entries(chart.scales).forEach(([scaleId, scale]) => {
            if (signalsToRender.includes(scaleId)) {
                const typedScale = scale as Scale;
                newManualLimits[scaleId] = { min: typedScale.min, max: typedScale.max };
            }
        });

        setManualYAxesLimits(newManualLimits);
        updateStatsPanels(chart);
    }, [manualYAxesLimits, signalsToRender, viewMode, updateStatsPanels]);

    const handleResetZoom = useCallback(() => {
        zoomStateRef.current = null;
        setManualYAxesLimits({});
    
        setTimeout(() => {
            const chartsToReset: ChartJS<'line'>[] = [];
            if (viewMode === 'overlay' && chartRef.current) {
                chartsToReset.push(chartRef.current);
            } else if (viewMode === 'stacked') {
                chartRefs.current.forEach(c => c && chartsToReset.push(c));
            }
    
            if (chartsToReset.length > 0) {
                chartsToReset.forEach(chart => chart.resetZoom('none'));
                updateStatsPanels(chartsToReset[0]);
            }
        }, 0);
    }, [viewMode, updateStatsPanels]);

    const handleSelectAll = () => { setSoloSignal(null); setSelectedSignals(new Set(allSignals)); };
    const handleDeselectAll = () => { setSoloSignal(null); setSelectedSignals(new Set()); };

    const handleSignalVisibilityToggle = (signal: string) => {
        if (soloSignal) setSoloSignal(null);
        setSelectedSignals(prev => {
            const newSet = new Set(prev);
            if (newSet.has(signal)) newSet.delete(signal); else newSet.add(signal);
            return newSet;
        });
    };

    const handleSignalNameClick = (signal: string) => {
        setSoloSignal(prev => (prev === signal ? null : signal));
    };

    const handleDownloadData = useCallback(() => {
        const chart = getActiveChart();
        if (!chart || relevantMessages.length === 0 || signalsToRender.length === 0) {
            alert("No data to download.");
            return;
        }
    
        const { min: minTimestamp, max: maxTimestamp } = chart.scales.x;
    
        const startIndex = findClosestIndex(minTimestamp, relevantMessages);
        const endIndex = findClosestIndex(maxTimestamp, relevantMessages);
        
        const visibleMessages = relevantMessages.slice(
            startIndex === -1 ? 0 : startIndex,
            endIndex === -1 ? relevantMessages.length : endIndex + 1
        );
    
        const headers = ['Timestamp', ...signalsToRender];
        const csvRows = [headers.join(',')];
    
        visibleMessages.forEach(msg => {
            const row = [Number(msg.timestamp).toFixed(6)];
            signalsToRender.forEach(signalName => {
                const value = msg.decoded?.[signalName];
                row.push(typeof value === 'number' ? String(value) : '');
            });
            csvRows.push(row.join(','));
        });
    
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'can_graph_data.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [getActiveChart, relevantMessages, signalsToRender]);
    
    const handleDownloadImage = useCallback(() => {
        const download = (chartInstance: ChartJS, filename: string) => {
            const link = document.createElement('a');
            link.href = chartInstance.toBase64Image();
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    
        if (viewMode === 'overlay') {
            const chart = chartRef.current;
            if (chart) download(chart, 'can_graph_overlay.png');
        } else { // stacked
            signalsToRender.forEach((signalName, index) => {
                setTimeout(() => {
                    const chart = chartRefs.current.get(signalName);
                    if (chart) download(chart, `can_graph_${signalName}.png`);
                }, index * 300);
            });
        }
    }, [viewMode, signalsToRender]);

    const selectionPlugin = useMemo(() => ({
        id: 'rangeSelection',
        afterDraw: (chart: ChartJS) => {
            if (selection.start === null || selection.end === null) return;
            
            const { ctx, chartArea: { top, bottom } } = chart;
            const startPixel = chart.scales.x.getPixelForValue(selection.start);
            const endPixel = chart.scales.x.getPixelForValue(selection.end);
            const x1 = Math.min(startPixel, endPixel);
            const x2 = Math.max(startPixel, endPixel);

            ctx.save();
            ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
            ctx.fillRect(x1, top, x2 - x1, bottom - top);
            const handleColor = '#eab308';
            [x1, x2].forEach(xPos => {
                ctx.strokeStyle = handleColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(xPos, top);
                ctx.lineTo(xPos, bottom);
                ctx.stroke();
                ctx.fillStyle = handleColor;
                ctx.beginPath();
                ctx.moveTo(xPos, top);
                ctx.lineTo(xPos - 5, top - 8);
                ctx.lineTo(xPos + 5, top - 8);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(xPos, bottom);
                ctx.lineTo(xPos - 5, bottom + 8);
                ctx.lineTo(xPos + 5, bottom + 8);
                ctx.closePath();
                ctx.fill();
            });
            ctx.restore();
        }
    }), [selection]);

    const handleChartMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const chart = getActiveChart();
        if (!isSelectMode || !chart) return;
        const rect = chart.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const timestamp = chart.scales.x.getValueForPixel(x);
        if (timestamp === undefined) return;
    
        if (hoveringMode) {
            setDraggingMode(hoveringMode);
            if (hoveringMode === 'range' && selection.start !== null && selection.end !== null) {
                dragStartRef.current = {
                    timestamp: timestamp,
                    selectionStart: selection.start,
                    selectionEnd: selection.end,
                };
            }
            return;
        }
    
        // Default: start drawing a new selection
        setSelection({ start: timestamp, end: timestamp });
        setDraggingMode('end'); // to simulate drawing
        setSelectedRangeStats(null);
    };

    const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const chart = getActiveChart();
        if (!chart || !isSelectMode) return;
        const rect = chart.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const timestamp = chart.scales.x.getValueForPixel(x);
        if (timestamp === undefined) return;
        
        // Dragging logic
        if (draggingMode) {
            if (draggingMode === 'range' && dragStartRef.current) {
                const delta = timestamp - dragStartRef.current.timestamp;
                const newStart = dragStartRef.current.selectionStart + delta;
                const newEnd = dragStartRef.current.selectionEnd + delta;
                setSelection({ start: newStart, end: newEnd });
            } else { // 'start' or 'end'
                 setSelection(prev => {
                    if (!prev) return prev;
                    const newSelection = { ...prev };
                    if (draggingMode === 'start') newSelection.start = timestamp;
                    else if (draggingMode === 'end') newSelection.end = timestamp;
                    return newSelection;
                });
            }
            return;
        }
        
        // Hovering logic
        if (selection.start !== null && selection.end !== null) {
            const startPixel = chart.scales.x.getPixelForValue(selection.start);
            const endPixel = chart.scales.x.getPixelForValue(selection.end);
            const handleThreshold = 10;
            
            if (Math.abs(x - startPixel) < handleThreshold) {
                setHoveringMode('start');
            } else if (Math.abs(x - endPixel) < handleThreshold) {
                setHoveringMode('end');
            } else if (x > Math.min(startPixel, endPixel) && x < Math.max(startPixel, endPixel)) {
                setHoveringMode('range');
            } else {
                setHoveringMode(null);
            }
        } else {
            setHoveringMode(null);
        }
    };

    const handleChartMouseUp = () => {
        if (draggingMode) {
            setDraggingMode(null);
            dragStartRef.current = null;
            
            if (selection.start !== null && selection.end !== null) {
                const start = Math.min(selection.start, selection.end);
                const end = Math.max(selection.start, selection.end);
                const finalSelection = { start, end };
                setSelection(finalSelection);
    
                const startIndex = findClosestIndex(start, relevantMessages);
                const endIndex = findClosestIndex(end, relevantMessages);
    
                if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
                    const stats = calculateAndSetStats(startIndex, endIndex);
                    setSelectedRangeStats(stats);
                } else {
                    setSelectedRangeStats(null);
                }
            }
        }
    };

    const handleOpenEditor = (signal: string) => {
        const currentLimits = manualYAxesLimits[signal];
        setTempLimits({ min: currentLimits?.min?.toString() ?? '', max: currentLimits?.max?.toString() ?? '' });
        setEditingSignal(signal);
    };

    const handleApplyManualLimits = () => {
        if (!editingSignal) return;
        const min = tempLimits.min === '' ? undefined : parseFloat(tempLimits.min);
        const max = tempLimits.max === '' ? undefined : parseFloat(tempLimits.max);
        if ((min !== undefined && isNaN(min)) || (max !== undefined && isNaN(max))) { alert('Please enter valid numbers for min/max.'); return; }
        if (min !== undefined && max !== undefined && min >= max) { alert('Min value must be less than Max value.'); return; }
        setManualYAxesLimits(prev => ({ ...prev, [editingSignal]: { min, max } }));
        setEditingSignal(null);
    };

    const handleResetAxisToAuto = () => {
        if (!editingSignal) return;
        setManualYAxesLimits(prev => {
            const newLimits = { ...prev };
            delete newLimits[editingSignal];
            return newLimits;
        });
        setEditingSignal(null);
        const chart = getActiveChart();
        if (chart) setTimeout(() => handleZoomComplete({ chart }), 0);
    };
    
    const baseChartOptions = useMemo<Omit<ChartOptions<'line'>, 'scales' | 'layout'>>(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false,
                external: (context: { tooltip: TooltipModel<'line'> }) => {
                    const { tooltip } = context;
                    
                    if (!isCtrlPressedRef.current) {
                        return;
                    }

                    if (tooltip.opacity === 0) {
                        if (cursorStats !== null) setCursorStats(null);
                        return;
                    }
                    const title = tooltip.title?.[0];
                    if (title) {
                        const values: Record<string, string> = {};
                        tooltip.body.forEach(bodyItem => {
                           const parts = bodyItem.lines[0].split(': ');
                           if(parts.length === 2) values[parts[0]] = parseFloat(parts[1]).toFixed(4);
                        });
                        const timestampValue = tooltip.dataPoints[0]?.parsed?.x;
                        setCursorStats({ timestamp: typeof timestampValue === 'number' ? timestampValue.toFixed(6) : title, values });
                    }
                }
            },
            zoom: {
                pan: { enabled: true, mode: 'xy', onPanComplete: handlePanComplete },
                zoom: { wheel: { enabled: true, speed: 0.1 }, pinch: { enabled: true }, mode: 'x', onZoomComplete: handleZoomComplete }
            }
        },
        onHover: (event: ChartEvent, chartElement: ActiveElement[]) => {
            const canvas = event.native?.target as HTMLCanvasElement;
            if (canvas) {
                let cursor = 'default';
                if (isCtrlPressedRef.current) {
                    cursor = 'crosshair';
                } else if (isSelectMode) {
                    switch(hoveringMode) {
                        case 'start':
                        case 'end':
                            cursor = 'ew-resize';
                            break;
                        case 'range':
                            cursor = 'move';
                            break;
                        default:
                            cursor = 'crosshair';
                    }
                }
                canvas.style.cursor = cursor;
            }
        }
    }), [isSelectMode, handlePanComplete, handleZoomComplete, hoveringMode, cursorStats]);

    const overlayChartData = useMemo<ChartData<'line'>>(() => ({
        datasets: signalsToRender.map((signalName) => {
            const signalIndex = allSignals.indexOf(signalName);
            const color = COLORS[signalIndex % COLORS.length];
            return {
                label: signalName,
                data: downsampledMessages.map(m => ({ x: Number(m.timestamp), y: m.decoded?.[signalName] ?? null })),
                borderColor: color,
                backgroundColor: `${color}33`,
                fill: 'start',
                stepped: lineMode === 'stepped',
                tension: lineMode === 'linear' ? 0.1 : 0,
                pointRadius: 1.5,
                borderWidth: 1.5,
                spanGaps: true,
                yAxisID: signalName,
            };
        })
    }), [downsampledMessages, signalsToRender, lineMode, allSignals]);

    const overlayChartOptions = useMemo<ChartOptions<'line'>>(() => {
        const yAxes: { [key: string]: ScaleOptions } = {};
        const finalYAxesLimits = { ...autoYAxesLimits, ...manualYAxesLimits };
        signalsToRender.forEach((signalName, index) => {
            const signalIndex = allSignals.indexOf(signalName);
            const color = COLORS[signalIndex % COLORS.length];
            yAxes[signalName] = {
                type: 'linear', position: 'left',
                ticks: { color, font: {size: 10}, padding: 5 },
                grid: { drawOnChartArea: index === 0, color: 'rgba(0, 0, 0, 0.05)' },
                border: { display: true, color },
                min: finalYAxesLimits[signalName]?.min,
                max: finalYAxesLimits[signalName]?.max,
            };
        });
        return {
            ...baseChartOptions,
            layout: { padding: { top: 10, bottom: 10 } },
            scales: {
                x: {
                    type: 'linear', display: true,
                    min: zoomStateRef.current?.min, max: zoomStateRef.current?.max,
                    ticks: { color: '#4b5563', maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: {size: 10}, callback: (v) => typeof v === 'number' ? v.toFixed(3) : v },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' }, border: { display: true, color: '#9ca3af' },
                    title: { display: true, text: 'Time (s)', color: '#1f2937', font: { size: 12, weight: 'bold' } }
                },
                ...yAxes,
            } as any
        };
    }, [baseChartOptions, signalsToRender, allSignals, autoYAxesLimits, manualYAxesLimits]);

    const createStackedChartData = useCallback((signalName: string): ChartData<'line'> => {
        const signalIndex = allSignals.indexOf(signalName);
        const color = COLORS[signalIndex % COLORS.length];
        return {
            datasets: [{
                label: signalName,
                data: downsampledMessages.map(m => ({ x: Number(m.timestamp), y: m.decoded?.[signalName] ?? null })),
                borderColor: color, backgroundColor: `${color}33`, fill: 'start',
                stepped: lineMode === 'stepped', tension: lineMode === 'linear' ? 0.1 : 0,
                pointRadius: 1.5, borderWidth: 1.5, spanGaps: true, yAxisID: signalName,
            }]
        };
    }, [downsampledMessages, allSignals, lineMode]);

    const createStackedChartOptions = useCallback((signalName: string, isLastChart: boolean): ChartOptions<'line'> => {
        const finalYAxesLimits = { ...autoYAxesLimits, ...manualYAxesLimits };
        const signalIndex = allSignals.indexOf(signalName);
        const color = COLORS[signalIndex % COLORS.length];
        return {
            ...baseChartOptions,
            layout: { padding: { top: 15, bottom: isLastChart ? 10 : 2, left: 5, right: 15 } },
            scales: {
                x: {
                    type: 'linear', display: isLastChart,
                    min: zoomStateRef.current?.min, max: zoomStateRef.current?.max,
                    ticks: { color: '#4b5563', maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: {size: 10}, callback: (v) => typeof v === 'number' ? v.toFixed(3) : v },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' }, border: { display: true, color: '#9ca3af' },
                    title: { display: isLastChart, text: 'Time (s)', color: '#1f2937', font: { size: 12, weight: 'bold' } }
                },
                [signalName]: {
                    type: 'linear', position: 'left',
                    ticks: { color, font: {size: 10}, padding: 5 },
                    grid: { drawOnChartArea: true, color: 'rgba(0, 0, 0, 0.05)' },
                    border: { display: true, color },
                    min: finalYAxesLimits[signalName]?.min,
                    max: finalYAxesLimits[signalName]?.max,
                }
            }
        };
    }, [baseChartOptions, allSignals, autoYAxesLimits, manualYAxesLimits]);

    return (
        <div className="flex h-[80vh] bg-gray-100 text-gray-800 rounded-lg border border-gray-300 text-sm overflow-hidden relative">
             {editingSignal && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditingSignal(null)}>
                    <div className="bg-white rounded-lg shadow-2xl p-4 w-72 text-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-gray-800 mb-3 text-base border-b pb-2">Edit Y-Axis: <span className="text-blue-600">{editingSignal}</span></h3>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="min-val" className="block text-xs font-medium text-gray-600">Min</label>
                                <input id="min-val" type="number" placeholder="Auto" value={tempLimits.min} onChange={e => setTempLimits(p => ({...p, min: e.target.value}))} className="mt-1 block w-full text-xs border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded-md p-2 shadow-sm"/>
                            </div>
                             <div>
                                <label htmlFor="max-val" className="block text-xs font-medium text-gray-600">Max</label>
                                <input id="max-val" type="number" placeholder="Auto" value={tempLimits.max} onChange={e => setTempLimits(p => ({...p, max: e.target.value}))} className="mt-1 block w-full text-xs border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded-md p-2 shadow-sm"/>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-between items-center">
                             <button onClick={handleResetAxisToAuto} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors">Auto-Scale</button>
                             <div className="flex gap-2">
                                <button onClick={() => setEditingSignal(null)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-transparent hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                                <button onClick={handleApplyManualLimits} className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Apply</button>
                             </div>
                        </div>
                    </div>
                </div>
            )}
            <div className={`bg-white flex flex-col border-r border-gray-300 transition-all duration-300 ease-in-out ${isLeftSidebarOpen ? 'w-56' : 'w-0'} overflow-hidden`}>
                <h2 className="p-2 font-bold border-b border-gray-300 flex-shrink-0">Channels</h2>
                <div className="p-2 border-b border-gray-300 space-y-2 flex-shrink-0">
                    <div>
                        <label className="block text-xs font-medium text-gray-700">Line Style</label>
                        <select value={lineMode} onChange={(e) => setLineMode(e.target.value as 'stepped' | 'linear')} className="mt-1 block w-full pl-2 pr-8 py-1 text-xs border-gray-300 bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md">
                            <option value="stepped">Stepped</option>
                            <option value="linear">Linear</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSelectAll} className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-600 hover:bg-gray-200">All</button>
                        <button onClick={handleDeselectAll} className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-600 hover:bg-gray-200">None</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {allSignals.map((signal) => {
                        const signalIndex = allSignals.indexOf(signal);
                        return (
                            <div key={signal} className={`flex items-center rounded-md hover:bg-gray-200 group ${soloSignal === signal ? 'bg-blue-100' : ''}`}>
                                <div className="flex-1 flex items-center p-1.5 cursor-pointer" onClick={() => handleSignalVisibilityToggle(signal)}>
                                    <div style={{ backgroundColor: COLORS[signalIndex % COLORS.length] }} className="w-2 h-4 rounded-sm mr-2 flex-shrink-0"></div>
                                    <input type="checkbox" readOnly checked={selectedSignals.has(signal)} className="w-4 h-4 rounded bg-gray-300 border-gray-400 text-blue-600 focus:ring-blue-500 pointer-events-none" />
                                    <span className={`ml-2 truncate ${soloSignal === signal ? 'font-bold' : ''}`} title={signal} onClick={(e) => { e.stopPropagation(); handleSignalNameClick(signal); }}>{signal}</span>
                                </div>
                                <button onClick={() => handleOpenEditor(signal)} className="ml-auto p-1 rounded-full text-gray-400 hover:bg-gray-300 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" title={`Edit ${signal} axis`}>
                                    <PencilIcon className="w-3 h-3" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="flex-1 flex flex-col p-1 min-w-0 relative">
                <div className="absolute top-1/2 -translate-y-1/2 -left-3 z-20">
                    <button onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)} className="bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full p-0.5 hover:bg-gray-200 transition-colors" aria-label="Toggle left sidebar">
                        {isLeftSidebarOpen ? <ChevronLeftIcon className="w-4 h-4 text-gray-600" /> : <ChevronRightIcon className="w-4 h-4 text-gray-600" />}
                    </button>
                </div>

                <div 
                    className={`flex-1 relative rounded-md transition-all ${isSelectMode ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${viewMode === 'stacked' ? 'overflow-y-auto custom-scrollbar' : ''}`} 
                    onMouseDown={handleChartMouseDown} 
                    onMouseMove={handleChartMouseMove} 
                    onMouseUp={handleChartMouseUp} 
                    onMouseLeave={handleChartMouseUp}
                >
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-white/70 backdrop-blur-sm p-1 rounded-lg border border-gray-200 shadow-sm">
                        {isDataDownsampled && (
                            <div className="group relative flex items-center">
                                <InfoIcon className="w-4 h-4 text-yellow-600 cursor-help" />
                                <span className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-gray-700 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                    Chart is displaying a sample of the full dataset to improve performance. All calculations and data exports use the full-resolution data.
                                </span>
                            </div>
                        )}
                        <button onClick={handleDownloadImage} className="p-1.5 text-xs rounded-md text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors" title="Download Chart Image (PNG)">
                            <CameraIcon className="w-4 h-4" />
                        </button>
                        <button onClick={handleDownloadData} className="p-1.5 text-xs rounded-md text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors" title="Download Visible Data (CSV)">
                            <DownloadIcon className="w-4 h-4" />
                        </button>
                        <button onClick={handleResetZoom} className="p-1.5 text-xs rounded-md text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors" title="Reset Zoom">
                            <MaximizeIcon className="w-4 h-4" />
                        </button>
                    </div>
                    
                    {viewMode === 'overlay' && (
                        <Line ref={chartRef} options={overlayChartOptions} data={overlayChartData} plugins={[selectionPlugin]} />
                    )}
                    {viewMode === 'stacked' && (
                         <div className="relative h-full" style={{minHeight: `${signalsToRender.length * 250}px`}}>
                            <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                                {signalsToRender.map((signal, index) => (
                                    <div key={signal} className="relative" style={{ height: '250px' }}>
                                        <div className="absolute top-1 left-3 text-xs font-bold z-10" style={{color: COLORS[allSignals.indexOf(signal) % COLORS.length]}}>
                                            {signal}
                                        </div>
                                        <Line
                                            ref={el => { if (el) chartRefs.current.set(signal, el); else chartRefs.current.delete(signal); }}
                                            options={createStackedChartOptions(signal, index === signalsToRender.length - 1)}
                                            data={createStackedChartData(signal)}
                                            plugins={[selectionPlugin]}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {isSelectMode && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg animate-pulse">Range Selection Mode (Press 'R' or 'Esc')</div>}
                </div>
                
                <div className="absolute top-1/2 -translate-y-1/2 -right-3 z-20">
                    <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className="bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full p-0.5 hover:bg-gray-200 transition-colors" aria-label="Toggle right sidebar">
                        {isRightSidebarOpen ? <ChevronRightIcon className="w-4 h-4 text-gray-600" /> : <ChevronLeftIcon className="w-4 h-4 text-gray-600" />}
                    </button>
                </div>
            </div>

            <div className={`bg-gray-50 flex flex-col border-l border-gray-300 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${isRightSidebarOpen ? 'w-64' : 'w-0'} overflow-hidden`}>
                {statsSignal ? (
                    <>
                        <h2 className="p-2 text-base font-bold border-b border-gray-300 text-blue-600 truncate flex-shrink-0" title={statsSignal}>
                            {statsSignal}
                        </h2>
                        <div className="p-2 space-y-2 flex-1">
                            <AccordionItem title="Cursor" defaultOpen={true}>
                                {cursorStats && statsSignal ? (
                                    <>
                                        <StatRow label="Timestamp" value={cursorStats.timestamp} unit="s" />
                                        <StatRow label="Value" value={cursorStats.values[statsSignal] ?? 'N/A'} unit={statsSignalUnit} />
                                    </>
                                ) : (
                                    <div className="text-xs text-gray-400 italic text-center py-1">
                                        Hold <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-200 border border-gray-300 rounded-md">Ctrl</kbd> to inspect data
                                    </div>
                                )}
                            </AccordionItem>
                             <AccordionItem title="Selected Range" defaultOpen={true}>
                                {selectedRangeStats && statsSignal && selectedRangeStats.signals[statsSignal] ? (
                                    (() => {
                                        const stats = selectedRangeStats.signals[statsSignal];
                                        return (
                                            <>
                                                <StatRow label="First timestamp" value={selectedRangeStats.t1} unit="s" />
                                                <StatRow label="Last timestamp" value={selectedRangeStats.t2} unit="s" />
                                                <StatRow label="Δt" value={formatStatValue(selectedRangeStats.dt)} unit="s" />
                                                <StatRow label="Min" value={formatStatValue(stats.min)} unit={statsSignalUnit} />
                                                <StatRow label="Max" value={formatStatValue(stats.max)} unit={statsSignalUnit} />
                                                <StatRow label="Average" value={formatStatValue(stats.avg)} unit={statsSignalUnit} />
                                                <StatRow label="RMS" value={formatStatValue(stats.rms)} unit={statsSignalUnit} />
                                                <StatRow label="STD" value={formatStatValue(stats.std)} unit={statsSignalUnit} />
                                                <StatRow label="Δ" value={formatStatValue(stats.delta)} unit={statsSignalUnit} />
                                            </>
                                        );
                                    })()
                                ) : <p className="text-xs text-gray-400 italic text-center py-1">Press 'R' and drag to select a range</p>}
                            </AccordionItem>
                             <AccordionItem title="Visible Range" defaultOpen={true}>
                                {visibleRangeStats && statsSignal && visibleRangeStats.signals[statsSignal] ? (
                                     (() => {
                                        const stats = visibleRangeStats.signals[statsSignal];
                                        return (
                                            <>
                                                <StatRow label="First timestamp" value={visibleRangeStats.t1} unit="s" />
                                                <StatRow label="Last timestamp" value={visibleRangeStats.t2} unit="s" />
                                                <StatRow label="Δt" value={formatStatValue(visibleRangeStats.dt)} unit="s" />
                                                <StatRow label="Min" value={formatStatValue(stats.min)} unit={statsSignalUnit} />
                                                <StatRow label="Max" value={formatStatValue(stats.max)} unit={statsSignalUnit} />
                                                <StatRow label="Average" value={formatStatValue(stats.avg)} unit={statsSignalUnit} />
                                                <StatRow label="RMS" value={formatStatValue(stats.rms)} unit={statsSignalUnit} />
                                                <StatRow label="STD" value={formatStatValue(stats.std)} unit={statsSignalUnit} />
                                                <StatRow label="Δ" value={formatStatValue(stats.delta)} unit={statsSignalUnit} />
                                            </>
                                        );
                                    })()
                                ) : <p className="text-xs text-gray-400 italic text-center py-1">Loading...</p>}
                            </AccordionItem>
                             <AccordionItem title="Overall">
                                <StatRow label="First timestamp" value={overallStats?.t1 ?? 'N/A'} unit="s" />
                                <StatRow label="Last timestamp" value={overallStats?.t2 ?? 'N/A'} unit="s" />
                            </AccordionItem>
                        </div>
                    </>
                ) : (
                     <div className="p-4 text-center text-sm text-gray-500">
                        Select a signal to view detailed stats.
                    </div>
                )}
            </div>
        </div>
    );
};