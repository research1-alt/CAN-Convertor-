import * as XLSX from 'xlsx';
import type { CANMessage, CanMatrix, SignalDefinition } from '../types';

let DEFAULT_PARSER_FOR_UNKNOWN_TYPES: 'log' | 'trc' = 'log';
const LOG_REGEX = /^\s*\((\d+(?:\.\d+)?)\)\s+\w+\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)\s*$/;
const TRC_REGEX = /^\s*\d+\)\s+(\d+(?:\.\d+)?)\s+(Rx|Tx)\s+([0-9A-Fa-fxX]+)\s+\d+\s*([0-9A-Fa-f\s]*)$/;
const PCAN_VIEW_REGEX = /^\s*\d+\s+([\d.]+)\s+\w+\s+([0-9A-Fa-fxX]+)\s+(Rx|Tx)\s+\d+\s*([0-9A-Fa-f\s]*)$/;
const PCAN_V5_REGEX = /^\s*\d+\)\s+([\d.]+)\s+(Rx|Tx)\s+([0-9A-Fa-f]+)\s+\d+\s*([0-9A-Fa-f\s]*)$/;
const CUSTOM_FORMAT_REGEX = /^\s*(\d+)\s+(0x[0-9A-Fa-f]+|[0-9A-Fa-f]+)\s+(\d+)\s+([0-9A-Fa-f\s]*)\s*$/;


const parseCustomFormatLine = (line: string): CANMessage | null => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('timestamp') || lowerLine.includes('can_id') || lowerLine.includes('data(hex)')) {
        return null;
    }

    const match = line.match(CUSTOM_FORMAT_REGEX);
    if (!match) return null;

    const [, timestamp, id, dlc, rawData] = match;
    const data = rawData.trim().split(/\s+/).filter(Boolean);
    const parsedId = id.toLowerCase().startsWith('0x') ? id : `0x${id}`;

    return {
        timestamp: parseInt(timestamp, 10),
        id: parsedId.toUpperCase(),
        dlc: parseInt(dlc, 10),
        data: data.map(byte => byte.toUpperCase()),
        isTx: false,
    };
};

const parseLogLine = (line: string): CANMessage | null => {
    const match = line.match(LOG_REGEX);
    if (!match) return null;

    const [, timestamp, id, rawData] = match;
    const data = rawData.match(/.{1,2}/g) || [];

    return {
        timestamp: parseFloat(timestamp),
        id: `0x${id.toUpperCase()}`,
        dlc: data.length,
        data: data.map(byte => byte.toUpperCase()),
        isTx: false,
    };
};

const parseTrcLine = (line: string): CANMessage | null => {
    const match = line.trim().match(TRC_REGEX);
    if (!match) return null;

    const [, timestamp, direction, id, rawData] = match;
    const data = rawData.trim().split(/\s+/).filter(Boolean);

    return {
        timestamp: parseFloat(timestamp),
        id: id.startsWith('0x') ? id.toUpperCase() : `0x${id.toUpperCase()}`,
        dlc: data.length,
        data: data.map(byte => byte.toUpperCase()),
        isTx: direction === 'Tx',
    };
};

const parsePcanViewLine = (line: string): CANMessage | null => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith(';')) {
        return null;
    }
    const match = trimmedLine.match(PCAN_VIEW_REGEX);
    if (!match) return null;

    const [, timestamp, id, direction, rawData] = match;
    const data = rawData.trim().split(/\s+/).filter(Boolean);

    return {
        timestamp: parseFloat(timestamp),
        id: id.startsWith('0x') ? id.toUpperCase() : `0x${id.toUpperCase()}`,
        dlc: data.length,
        data: data.map(byte => byte.toUpperCase()),
        isTx: direction === 'Tx',
    };
};

const parsePcanV5Line = (line: string): CANMessage | null => {
    const match = line.match(PCAN_V5_REGEX);
    if (!match) return null;

    const [, timestamp, direction, id, rawData] = match;
    const data = rawData.trim().split(/\s+/).filter(Boolean);

    return {
        timestamp: parseFloat(timestamp),
        id: `0x${id.toUpperCase()}`,
        dlc: data.length,
        data: data.map(byte => byte.toUpperCase()),
        isTx: direction === 'Tx',
    };
};

export const parseExcelFile = async (file: File): Promise<CANMessage[]> => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const worksheet = workbook.Sheets[sheetName];
    const json: any[] = XLSX.utils.sheet_to_json(worksheet);

    const messages: CANMessage[] = [];
    
    const findHeader = (headers: string[], possibleNames: string[]): string | undefined => {
        for (const name of possibleNames) {
            const header = headers.find(h => h.toLowerCase() === name.toLowerCase());
            if (header) return header;
        }
        return undefined;
    };
    
    if (json.length === 0) return [];

    const headers = Object.keys(json[0]);
    const timestampHeader = findHeader(headers, ['timestamp', 'time']);
    const idHeader = findHeader(headers, ['id', 'can id', 'canid', 'can_id', 'arbitration id', 'message id']);
    const dlcHeader = findHeader(headers, ['dlc', 'data length code', 'len', 'length']);
    const dataHeader = findHeader(headers, ['data', 'payload', 'data bytes', 'data(hex)']);
    const typeHeader = findHeader(headers, ['type', 'direction', 'tx/rx']);

    if (!timestampHeader || !idHeader || !dlcHeader || !dataHeader) {
        throw new Error('Excel file must contain at least "Timestamp", "ID", "DLC", and "Data" columns.');
    }

    for (const row of json) {
        try {
            const timestamp = row[timestampHeader];
            const id = row[idHeader];
            const dlc = row[dlcHeader];
            const rawData = row[dataHeader];

            if (timestamp === undefined || id === undefined || dlc === undefined || rawData === undefined) {
                console.warn("Skipping a row in Excel file due to missing essential data:", row);
                continue;
            }

            const idStr = String(id);
            const dataStr = String(rawData).trim().replace(/0x/gi, '');
            const dataBytes = dataStr.split(/[\s,]+/).filter(Boolean);

            const message: CANMessage = {
                timestamp: parseFloat(String(timestamp)),
                id: idStr.startsWith('0x') ? idStr.toUpperCase() : `0x${idStr.toUpperCase()}`,
                dlc: parseInt(String(dlc), 10),
                data: dataBytes.map(byte => byte.toUpperCase()),
                isTx: typeHeader && row[typeHeader] ? String(row[typeHeader]).toLowerCase().includes('tx') : false,
            };
            
            if (isNaN(Number(message.timestamp)) || isNaN(message.dlc)) {
                 console.warn("Skipping a row in Excel file due to invalid numeric data:", row);
                 continue;
            }

            messages.push(message);
        } catch (e) {
            console.warn("Skipping a row in Excel file due to parsing error:", e, "Row:", row);
        }
    }
    
    return messages;
};

export const parseCanLogFile = (content: string, fileName: string): CANMessage[] => {
    const lines = content.split(/\r?\n/);
    const lowerFileName = fileName.toLowerCase();
    const messages: CANMessage[] = [];

    const logParsers = [parseCustomFormatLine, parseLogLine, parsePcanV5Line, parseTrcLine, parsePcanViewLine];
    const trcParsers = [parseCustomFormatLine, parsePcanV5Line, parseTrcLine, parsePcanViewLine, parseLogLine];

    let orderedParsers = DEFAULT_PARSER_FOR_UNKNOWN_TYPES === 'log' ? logParsers : trcParsers;
    if (lowerFileName.endsWith('.log')) {
        orderedParsers = logParsers;
    } else if (lowerFileName.endsWith('.trc')) {
        orderedParsers = trcParsers;
    }

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith(';')) {
            continue;
        }

        for (const parser of orderedParsers) {
            const message = parser(trimmedLine);
            if (message) {
                messages.push(message);
                break;
            }
        }
    }

    return messages;
};

const extractSignalValue = (data: Uint8Array, signal: SignalDefinition): number => {
    let rawValue = 0;
    
    if (signal.isLittleEndian) {
        for (let i = 0; i < signal.length; i++) {
            const bitIndex = signal.startBit + i;
            const byteIndex = Math.floor(bitIndex / 8);
            if (byteIndex >= data.length) continue;
            const bitInByte = bitIndex % 8;
            if ((data[byteIndex] >> bitInByte) & 1) {
                rawValue |= 1 << i;
            }
        }
    } else {
        let bitCount = 0;
        for (let i = 0; i < 8 * 8; i++) {
            const byteIndex = Math.floor(i / 8);
            if (byteIndex >= data.length) break;
            const bitInByte = 7 - (i % 8);
            if (i >= signal.startBit && i < signal.startBit + signal.length) {
                if ((data[byteIndex] >> bitInByte) & 1) {
                    rawValue |= 1 << (signal.length - 1 - bitCount);
                }
                bitCount++;
            }
        }
    }

    if (signal.isSigned && (rawValue & (1 << (signal.length - 1)))) {
        rawValue -= 1 << signal.length;
    }

    return rawValue * signal.scale + signal.offset;
}

export const decodeMessages = (messages: CANMessage[], matrix: CanMatrix): CANMessage[] => {
    return messages.map(message => {
        const messageId = parseInt(message.id, 16).toString();
        const definition = matrix[messageId];

        if (!definition) {
            return message;
        }

        const dataBytes = new Uint8Array(message.data.map(hex => parseInt(hex, 16)));
        const decodedSignals: { [key: string]: number } = {};

        for (const signalName in definition.signals) {
            const signal = definition.signals[signalName];
            const value = extractSignalValue(dataBytes, signal);
            decodedSignals[signal.name] = parseFloat(value.toPrecision(10));
        }

        return { ...message, decoded: decodedSignals };
    });
};