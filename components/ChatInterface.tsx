import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { SendIcon } from './IconComponents';
import { Spinner } from './Spinner';

interface ChatInterfaceProps {
    messages: ChatMessage[];
    onSendMessage: (message: string) => void;
    isLoading: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <div className="border rounded-lg flex flex-col h-[500px]" style={{backgroundColor: 'rgba(13, 119, 248, 0.03)', borderColor: 'var(--color-border)'}}>
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xl p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-600/80' : 'bg-gray-700/60'}`}>
                            <pre className="whitespace-pre-wrap text-gray-200 font-sans text-sm leading-relaxed">{msg.content}</pre>
                        </div>
                    </div>
                ))}
                {isLoading && messages[messages.length-1]?.role === 'user' && (
                     <div className="flex justify-start">
                        <div className="max-w-lg p-3 rounded-lg bg-gray-700/60">
                           <Spinner />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)'}}>
                <form onSubmit={handleSubmit} className="flex items-center space-x-3">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a follow-up question..."
                        disabled={isLoading}
                        className="flex-1 w-full px-4 py-2 bg-gray-800/80 border border-gray-600/80 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-200"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="p-3 bg-blue-600 rounded-full text-white hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 transition-all transform hover:scale-110"
                        aria-label="Send message"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
};