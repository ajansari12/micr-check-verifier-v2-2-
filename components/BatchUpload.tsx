import React, { useState, useCallback, DragEvent } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface BatchUploadProps {
  onBatchSubmit: (files: FileList, mockBatchId: string, mockTotalCheques: number) => void;
  isUploadingGlobal?: boolean;
}

const BatchUpload: React.FC<BatchUploadProps> = ({ onBatchSubmit, isUploadingGlobal }) => {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFiles(event.target.files);
    } else {
      setSelectedFiles(null);
    }
  };

  const handleSubmit = useCallback(() => {
    if (!selectedFiles || selectedFiles.length === 0) {
      setError("No files selected. Please choose a batch file.");
      return;
    }
    if (isUploadingGlobal || isUploading) {
      setError("An upload is already in progress.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);
        // Simulate getting a batch ID and estimated cheque count
        const mockBatchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        // For ZIPs, total cheques would be unknown until backend unpacks. For multi-page PDF/TIFF, it's pages.
        // For simplicity, using file count or a random number.
        const mockTotalCheques = selectedFiles[0].type === 'application/zip' ? Math.floor(Math.random() * (10000 - 50 + 1)) + 50 : selectedFiles.length;
        
        onBatchSubmit(selectedFiles, mockBatchId, mockTotalCheques);
        setIsUploading(false);
        setSelectedFiles(null); 
        // Clear the file input visually if possible (though direct manipulation is tricky)
        const fileInput = document.getElementById('batch-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

      }
    }, 200);
  }, [selectedFiles, onBatchSubmit, isUploadingGlobal, isUploading]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isUploadingGlobal && !isUploading) setIsDragging(true);
  }, [isUploadingGlobal, isUploading]);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    setError(null);
    if (isUploadingGlobal || isUploading) return;

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      // Assuming single batch file upload for simplicity, e.g., one ZIP or one multi-page PDF
      setSelectedFiles(files); 
    }
  }, [isUploadingGlobal, isUploading]);

  const commonButtonClasses = "font-semibold py-2.5 px-5 rounded-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm";

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-200">
      <h3 className="text-xl font-semibold text-blue-800 mb-4">Upload Cheque Batch</h3>
      <p className="text-sm text-slate-600 mb-1">Supported formats: ZIP (containing images), multi-page PDF, multi-page TIFF.</p>
      <p className="text-xs text-slate-500 mb-4">Max batch size typically 10,000 cheques or 1GB (simulated limits may vary).</p>

      <div
        className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
          ${isDragging ? 'border-blue-600 bg-blue-100' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'}
          ${(isUploadingGlobal || isUploading) ? 'opacity-60 cursor-not-allowed' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploadingGlobal && !isUploading && (document.getElementById('batch-file-input') as HTMLInputElement)?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload batch file by clicking or dragging"
      >
        <input
          type="file"
          id="batch-file-input"
          onChange={handleFileChange}
          accept=".zip,application/zip,application/pdf,image/tiff,image/tif"
          className="hidden"
          disabled={isUploadingGlobal || isUploading}
          multiple={false} // Typically one batch file at a time
        />
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-slate-400 mb-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm text-slate-600 font-medium">
          <span className="text-blue-600 font-semibold">Click to select batch file</span> or drag & drop here
        </p>
        {selectedFiles && selectedFiles.length > 0 && !isUploading && (
          <p className="text-xs text-slate-500 mt-1">Selected: {selectedFiles[0].name}</p>
        )}
         {isUploading && (
          <p className="text-xs text-slate-500 mt-1">Uploading: {selectedFiles?.[0]?.name || 'file'}...</p>
        )}
      </div>

      {isUploading && (
        <div className="mt-4">
          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-200 ease-linear" style={{ width: `${uploadProgress}%` }}></div>
          </div>
          <p className="text-xs text-blue-700 text-center mt-1">{uploadProgress}% Uploaded</p>
        </div>
      )}
      
      {error && (
        <p className="text-xs text-red-600 mt-2 text-center">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!selectedFiles || selectedFiles.length === 0 || isUploadingGlobal || isUploading}
        className={`${commonButtonClasses} w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white`}
      >
        {isUploading ? <LoadingSpinner size="h-4 w-4 mr-2" color="text-white" /> : 
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" /></svg>
        }
        {isUploading ? 'Submitting Batch...' : 'Submit Batch for Processing'}
      </button>
    </div>
  );
};

export default React.memo(BatchUpload);
