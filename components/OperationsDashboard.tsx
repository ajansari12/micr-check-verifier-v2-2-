import React from 'react';
import { ChequeBatch } from '../types';
import BatchUpload from './BatchUpload';
import BatchStatusItem from './BatchStatusItem';
import LoadingSpinner from './LoadingSpinner';

interface OperationsDashboardProps {
  batches: ChequeBatch[];
  onBatchSubmit: (files: FileList, mockBatchId: string, mockTotalCheques: number) => void;
  isUploadingBatch?: boolean; // Global uploading state from App.tsx
  onViewBatchDetails?: (batchId: string) => void; // Placeholder for future
}

const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  batches,
  onBatchSubmit,
  isUploadingBatch,
  onViewBatchDetails = (id) => alert(`Viewing details for batch ${id} (placeholder)`),
}) => {
  // Aggregate statistics (examples, could be more complex)
  const totalBatches = batches.length;
  const processingBatches = batches.filter(b => b.status === 'processing' || b.status === 'queued' || b.status === 'uploading').length;
  const completedBatches = batches.filter(b => b.status === 'completed' || b.status === 'partially_completed').length;
  const totalChequesInQueue = batches.reduce((sum, b) => sum + (b.status !== 'completed' && b.status !== 'failed' ? (b.totalCheques - b.processedCheques) : 0), 0);
  const totalErrorsAcrossBatches = batches.reduce((sum, b) => sum + b.cheques.filter(c => c.status === 'error').length, 0);

  const sortedBatches = [...batches].sort((a, b) => new Date(b.uploadTimestamp).getTime() - new Date(a.uploadTimestamp).getTime());

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-blue-900">Batch Operations Dashboard</h2>
        <p className="text-slate-600">Upload, monitor, and manage bulk cheque processing.</p>
      </header>

      {/* Aggregate Statistics Section */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Batches', value: totalBatches, icon: '🗂️' },
          { label: 'Active/Queued', value: processingBatches, icon: <LoadingSpinner size="h-4 w-4 inline-block mr-1" color="text-blue-700"/> },
          { label: 'Completed Today', value: completedBatches, icon: '✅' }, // Assuming "today", for simplicity
          { label: 'Cheques in Queue', value: totalChequesInQueue, icon: '⏳' },
        ].map(stat => (
          <div key={stat.label} className="bg-white p-4 rounded-lg shadow border border-slate-200">
            <div className="flex items-center text-slate-500 text-sm mb-1">
              <span className="mr-1.5 text-lg">{stat.icon}</span>
              {stat.label}
            </div>
            <div className="text-2xl font-bold text-blue-800">{stat.value}</div>
          </div>
        ))}
         {totalErrorsAcrossBatches > 0 && (
             <div className="col-span-2 md:col-span-4 bg-red-50 p-3 rounded-lg border border-red-200 text-red-700 text-sm font-medium">
                 🚨 Total Errors Across All Batches: {totalErrorsAcrossBatches}. Please review affected batches.
             </div>
         )}
      </section>

      {/* Main Layout: Upload and Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Section */}
        <aside className="lg:col-span-1">
          <BatchUpload onBatchSubmit={onBatchSubmit} isUploadingGlobal={isUploadingBatch} />
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
            <h4 className="font-semibold mb-1">Batch Processing Notes:</h4>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Ensure batch files (ZIP, PDF, TIFF) are correctly formatted.</li>
              <li>Processing times vary based on batch size and system load.</li>
              <li>Detailed results and reports will be available upon completion.</li>
              <li>CPA Standard 006 compliance is checked for each cheque.</li>
            </ul>
          </div>
        </aside>

        {/* Batch Queue/Status Section */}
        <main className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-blue-800 mb-4">Batch Processing Queue</h3>
          {batches.length === 0 ? (
            <div className="p-6 text-center text-slate-500 bg-white rounded-lg shadow border border-slate-200">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-slate-300 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              <p>No batches currently processing or in history.</p>
              <p className="text-sm">Upload a new batch to begin.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {sortedBatches.map(batch => (
                <BatchStatusItem key={batch.batchId} batch={batch} onViewDetails={onViewBatchDetails} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default React.memo(OperationsDashboard);
