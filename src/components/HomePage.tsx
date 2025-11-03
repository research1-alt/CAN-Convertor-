import React, { useState, useCallback } from 'react';
import { FileUpload } from './FileUpload';
import { Spinner } from './Spinner';
import { defaultMatrix } from '../services/defaultMatrix';
import type { CANMessage } from '../types';
import { FileIcon, AlertTriangleIcon, CodeBracketIcon, ComputerDesktopIcon } from './IconComponents';

interface HomePageProps {
    onDataProcessed: (messages: CANMessage[], files: File[]) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onDataProcessed }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const resetState = useCallback(() => {
        setFiles([]);
        setError(null);
    }, []);
    
    const handleFileChange = (selectedFiles: FileList | null) => {
        if (selectedFiles) {
            resetState(); // Reset on new file selection
            const acceptedFiles = Array.from(selectedFiles);
            setFiles(acceptedFiles);
        }
    };
    
    const processRawLogFiles = useCallback(async () => {
        if (files.length === 0) {
            setError('Please select at least one log file.');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const { parseCanLogFile, decodeMessages, parseExcelFile } = await import('../services/canParser');
            let allMessages: CANMessage[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const lowerFileName = file.name.toLowerCase();
                let messages: CANMessage[] = [];

                if (lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls')) {
                    messages = await parseExcelFile(file);
                } else {
                    const content = await file.text();
                    messages = parseCanLogFile(content, file.name);
                }
                allMessages.push(...messages);
            }
            
            allMessages = decodeMessages(allMessages, defaultMatrix);
            
            if (allMessages.length === 0) {
                setError('No valid CAN messages found in the provided files.');
                setIsLoading(false);
                return;
            }
            
            onDataProcessed(allMessages, files);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred during parsing.');
        } finally {
            setIsLoading(false);
        }
    }, [files, onDataProcessed]);

    return (
        <>
            <header className="text-center mb-10">
                <div className="flex items-center justify-center gap-4 mb-2">
                    <ComputerDesktopIcon className="w-12 h-12 text-blue-400"/>
                    <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                        CAN Signal Intelligence
                    </h1>
                </div>
                <p className="text-lg text-gray-400">
                    Decode raw CAN logs, visualize signal data, and analyze with AI.
                </p>
            </header>

            <main style={{
                backgroundColor: 'var(--color-container)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 0 30px -10px var(--color-accent-glow)'
            }}
            className="backdrop-blur-sm rounded-2xl p-6 sm:p-8 space-y-8">
                
                <div className="flex border-b" style={{ borderColor: 'var(--color-border)'}}>
                    <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-blue-500 text-blue-400">
                        <CodeBracketIcon className="w-5 h-5" />
                        CAN File Decode
                    </div>
                </div>
                
                <div className="animate-fade-in">
                    <div className="grid grid-cols-1 gap-6">
                        <FileUpload 
                            onFileChange={handleFileChange}
                            title="Upload CAN Log File(s)"
                            description="Drop .log, .trc, .xlsx, or any text-based log here"
                        />
                    </div>
                </div>

                {files.length > 0 && (
                    <div className="border-t pt-6" style={{ borderColor: 'var(--color-border)'}}>
                        <h3 className="font-semibold text-gray-300 mb-3 text-lg">Selected Files:</h3>
                        <ul className="space-y-2">
                            {files.map((file, index) => (
                                <li key={index} className="flex items-center p-3 rounded-lg" style={{backgroundColor: 'rgba(13, 119, 248, 0.05)', border: '1px solid var(--color-border)'}}>
                                    <FileIcon className="w-5 h-5 text-blue-400 mr-4 flex-shrink-0" />
                                    <span className="text-gray-200 truncate font-medium">{file.name}</span>
                                    <span className="ml-auto text-gray-500 text-sm pl-4">{(file.size / 1024).toFixed(2)} KB</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <button
                        onClick={processRawLogFiles}
                        disabled={isLoading || files.length === 0}
                        className="w-full sm:w-auto flex-1 inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:bg-gray-600 disabled:saturate-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
                    >
                        {isLoading ? <Spinner /> : 'Convert & Process'}
                    </button>
                </div>

                {error && (
                        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative flex items-start" role="alert">
                        <AlertTriangleIcon className="w-5 h-5 mr-3 mt-1 flex-shrink-0"/>
                        <div>
                            <strong className="font-bold">Error: </strong>
                            <span className="block sm:inline">{error}</span>
                        </div>
                    </div>
                )}
            </main>
        </>
    );
};