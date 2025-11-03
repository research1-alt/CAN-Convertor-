import React, { useState, useCallback } from 'react';
import { UploadCloudIcon } from './IconComponents';

interface FileUploadProps {
    onFileChange: (files: FileList | null) => void;
    title?: string;
    description?: string;
    accept?: string;
    multiple?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
    onFileChange,
    title = "Click to upload",
    description = "or drag and drop",
    accept,
    multiple = true
 }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileChange(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    }, [onFileChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onFileChange(e.target.files);
    };

    const borderStyle = isDragging ? { borderColor: 'var(--color-accent)', boxShadow: '0 0 15px -2px var(--color-accent-glow)'} : { borderColor: 'var(--color-border)' };

    return (
        <div 
            className="relative group w-full p-8 border rounded-xl text-center cursor-pointer transition-all duration-300"
            style={{ backgroundColor: 'rgba(13, 119, 248, 0.03)', ...borderStyle }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById(`file-input-${multiple ? 'multi' : 'single'}${accept}`)?.click()}
        >
            <input
                type="file"
                id={`file-input-${multiple ? 'multi' : 'single'}${accept}`}
                className="hidden"
                multiple={multiple}
                onChange={handleChange}
                accept={accept}
            />
            <div className="flex flex-col items-center justify-center space-y-4">
                <UploadCloudIcon className={`w-12 h-12 text-gray-500 group-hover:text-blue-400 transition-colors duration-300 ${isDragging ? 'text-blue-400' : ''}`} />
                <div>
                  <p className="text-gray-300 text-lg">
                      <span className="font-semibold text-blue-400">{title}</span>
                  </p>
                  <p className="text-sm text-gray-500">{description}</p>
                </div>
                 <p className="text-xs text-gray-500 pt-2">
                     {accept ? `Supported: ${accept.split(',').join(', ')}` : "Any text-based log or Excel file"}
                </p>
            </div>
        </div>
    );
};