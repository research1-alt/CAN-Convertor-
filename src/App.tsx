
import React, { useState, Suspense, lazy } from 'react';
import type { CANMessage } from './types';
import { HomePage } from './components/HomePage';

const DashboardPage = lazy(() => import('./components/DashboardPage').then(module => ({ default: module.DashboardPage })));

const LoadingDashboard: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-[80vh] text-gray-400">
        <div className="w-10 h-10 border-4 border-t-transparent border-blue-400 rounded-full animate-spin" role="status">
            <span className="sr-only">Loading...</span>
        </div>
        <p className="mt-4 text-lg">Loading Dashboard...</p>
    </div>
);

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
                    <Suspense fallback={<LoadingDashboard />}>
                        <DashboardPage 
                            initialMessages={processedData.messages} 
                            initialFiles={processedData.files} 
                            onGoBack={handleGoBack} 
                        />
                    </Suspense>
                ) : (
                    <HomePage onDataProcessed={handleDataProcessed} />
                )}
            </div>
        </div>
    );
};

export default App;
