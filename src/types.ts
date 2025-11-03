
export interface CANMessage {
    timestamp: number | string;
    id: string;
    dlc: number;
    data: string[];
    isTx: boolean;
    decoded?: { [signalName: string]: number };
}

export interface SignalDefinition {
    name: string;
    startBit: number;
    length: number;
    isLittleEndian: boolean;
    isSigned: boolean;
    scale: number;
    offset: number;
    min: number;
    max: number;
    unit: string;
}

export interface MessageDefinition {
    name: string;
    dlc: number;
    signals: { [signalName: string]: SignalDefinition };
}

export type CanMatrix = {
    // Message ID (decimal string) -> MessageDefinition
    [messageId: string]: MessageDefinition;
};

export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}