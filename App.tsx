import React, { useState } from 'react';
import type { CANMessage } from './types';
import { HomePage } from './components/HomePage';
import { DashboardPage } from './components/DashboardPage';

const App: React.FC = () => {
    const [processedData, setProcessedData] = useState<{ messages: CANMessage[], files: File[] } | null>(null);

    const handleDataProcessed = (messages: CANMessage[], files: File[]) => {
        setProcessedData({ messages, files });
    };

    const handleGoBack = () => {
        setProcessedData(null);
    };

    const maxWClass = processedData ? 'max-w-7xl' : 'max-w-5xl';

    return (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
            <div className={`w-full ${maxWClass} mx-auto transition-all duration-500`}>
                {processedData ? (
                    <DashboardPage 
                        initialMessages={processedData.messages} 
                        initialFiles={processedData.files} 
                        onGoBack={handleGoBack} 
                    />
                ) : (
                    <HomePage onDataProcessed={handleDataProcessed} />
                )}
            </div>
        </div>
    );
};

export default App;
