import React from 'react';
import { ChequeBatch } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface BatchStatusItemProps {
  batch: ChequeBatch;
  onViewDetails?: (batchId: string) => void;
  // Add other action callbacks as needed, e.g., onDownloadReport, onRetryFailed
}

const BatchStatusItem: React.FC<BatchStatusItemProps> = ({ batch, onViewDetails }) => {
  const { batchId, originalFilename, uploadTimestamp, totalCheques, processedCheques, status } = batch;

  const getStatusColorClasses = () => {
    switch (status) {
      case 'uploading':
      case 'queued':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'partially_completed':
        return 'bg-yellow-100 text-yellow-800 border-yellow-400';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const progressPercentage = totalCheques > 0 ? Math.round((processedCheques / totalCheques) * 100) : 0;
  const errorsInBatch = batch.cheques.filter(c => c.status === 'error').length;

  return (
    <div className={`p-4 rounded-lg shadow-md border ${getStatusColorClasses()} mb-4`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
        <div>
          <h4 className="text-md font-semibold text-inherit">Batch ID: {batchId}</h4>
          <p className="text-xs text-slate-500">File: {originalFilename}</p>
        </div>
        <span className={`px-3 py-1 text-xs font-semibold rounded-full shadow-sm ${getStatusColorClasses().replace('border-', 'bg-').replace('text-', 'text-').replace('100', '200')}`}>
          Status: {status.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-slate-600 mb-0.5">
          <span>Progress: {processedCheques} / {totalCheques} Cheques</span>
          <span>{progressPercentage}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
          <div 
            className={`h-full rounded-full ${
              status === 'completed' ? 'bg-green-500' : 
              status === 'failed' ? 'bg-red-500' :
              status === 'partially_completed' ? 'bg-yellow-500' :
              'bg-blue-500'
            } transition-all duration-300 ease-linear`} 
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>

      <div className="text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <p>Uploaded: {new Date(uploadTimestamp).toLocaleString()}</p>
        {errorsInBatch > 0 && <p className="text-red-600 font-medium mt-1 sm:mt-0">{errorsInBatch} Error(s) in Batch</p>}
      </div>
      
      {(status === 'processing' || status === 'queued' || status === 'uploading') && isNaN(progressPercentage) && (
        <div className="mt-2 flex items-center text-xs text-blue-700">
          <LoadingSpinner size="h-3 w-3 mr-1.5" color="text-blue-600" />
          Awaiting processing details...
        </div>
      )}


      {/* Placeholder for actions */}
      <div className="mt-3 pt-3 border-t border-slate-300/50 flex flex-wrap gap-2">
        {onViewDetails && (status === 'completed' || status === 'partially_completed' || status === 'failed') && (
           <button 
            onClick={() => onViewDetails(batchId)}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors"
          >
            View Details
          </button>
        )}
        {/* Add more buttons like "Download Report", "Retry Failed Cheques" later */}
        <button 
          disabled 
          className="px-3 py-1.5 text-xs bg-slate-300 text-slate-500 rounded-md cursor-not-allowed"
        >
          Download Report (Soon)
        </button>
      </div>
    </div>
  );
};

export default React.memo(BatchStatusItem);
