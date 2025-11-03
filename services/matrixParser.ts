import type { CanMatrix, MessageDefinition, SignalDefinition } from '../types';

// Regex to capture message definitions (BO_)
const MESSAGE_REGEX = /^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(.+)/;

// Regex to capture signal definitions (SG_)
// UPDATED: Made the [min|max] value range optional by using a non-capturing group (?:...)?
// This makes the parser compatible with a wider variety of DBC files.
const SIGNAL_REGEX = /^\s*SG_\s+(\w+)\s*:\s*(\d+)\|(\d+)@(\d+)([+-])\s+\(([\d.-]+),([\d.-]+)\)(?:\s+\[([\d.-]+)\|([\d.-]+)\])?\s+"([^"]*)"/;

export const parseDbcFile = (content: string): CanMatrix => {
    const lines = content.split('\n');
    const matrix: CanMatrix = {};
    let currentMessage: MessageDefinition | null = null;
    let currentMessageId: string | null = null;

    for (const line of lines) {
        const trimmedLine = line.trim();
        const messageMatch = trimmedLine.match(MESSAGE_REGEX);
        const signalMatch = trimmedLine.match(SIGNAL_REGEX);

        if (messageMatch) {
            const [, id, name, dlc] = messageMatch;
            currentMessageId = id;
            currentMessage = {
                name,
                dlc: parseInt(dlc, 10),
                signals: {},
            };
            matrix[currentMessageId] = currentMessage;
        } else if (signalMatch && currentMessage && currentMessageId) {
            // UPDATED: Destructuring now accounts for optional min/max values, which may be undefined.
            const [
                ,
                name,
                startBit,
                length,
                byteOrder,
                sign,
                scale,
                offset,
                min, // Can be undefined
                max, // Can be undefined
                unit,
            ] = signalMatch;

            const signal: SignalDefinition = {
                name,
                startBit: parseInt(startBit, 10),
                length: parseInt(length, 10),
                isLittleEndian: parseInt(byteOrder, 10) === 1, // 1 for Intel (little-endian), 0 for Motorola (big-endian)
                isSigned: sign === '-',
                scale: parseFloat(scale),
                offset: parseFloat(offset),
                // UPDATED: Provide default values for min/max if they are not defined in the signal.
                min: parseFloat(min || '0'),
                max: parseFloat(max || '0'),
                unit,
            };
            currentMessage.signals[name] = signal;
        }
    }

    return matrix;
};