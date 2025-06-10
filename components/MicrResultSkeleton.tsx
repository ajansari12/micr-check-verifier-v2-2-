import React from 'react';

const SkeletonLine: React.FC<{ widthClass?: string; heightClass?: string; className?: string }> = ({ widthClass = 'w-full', heightClass = 'h-4', className = '' }) => (
  <div className={`bg-slate-300 rounded animate-pulse ${heightClass} ${widthClass} ${className}`}></div>
);

const MicrResultSkeleton: React.FC = () => {
  return (
    <div className="mt-6 bg-white shadow-lg rounded-lg animate-pulse">
      {/* Risk Banner Skeleton */}
      <div className="p-4 border-b-4 border-slate-300">
        <SkeletonLine widthClass="w-3/5" heightClass="h-6" className="mb-2" />
        <SkeletonLine widthClass="w-2/5" heightClass="h-4" />
      </div>

      <div className="p-4 sm:p-6">
        {/* Header and Export Skeleton */}
        <div className="flex justify-between items-center mb-4">
          <SkeletonLine widthClass="w-1/2" heightClass="h-7" />
          <SkeletonLine widthClass="w-28" heightClass="h-9" />
        </div>

        {/* Tabs Skeleton */}
        <div className="border-b border-slate-300 mb-1">
          <nav className="-mb-px flex space-x-1" aria-label="Tabs">
            {['w-24', 'w-36', 'w-28'].map((w, i) => (
              <div key={i} className={`py-2 px-4 rounded-t-lg bg-slate-200 ${w} h-9`}></div>
            ))}
          </nav>
        </div>

        {/* Content Area Skeleton - Mimicking Overview Tab primarily */}
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 pt-4">
          {/* Left Column (Image + Key Info) */}
          <div className="space-y-4">
            <div>
              <SkeletonLine widthClass="w-32" heightClass="h-5" className="mb-2" />
              <div className="rounded-md border border-slate-300 bg-slate-200 w-full aspect-video max-h-72"></div>
            </div>
            <div className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-3">
              <SkeletonLine widthClass="w-40" heightClass="h-5" className="mb-2" />
              <SkeletonLine heightClass="h-8" />
              <SkeletonLine heightClass="h-8" />
              <SkeletonLine heightClass="h-8" />
            </div>
          </div>

          {/* Right Column (MICR Details) */}
          <div className="space-y-4">
            <div className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-3">
              <SkeletonLine widthClass="w-48" heightClass="h-5" className="mb-3" />
              <SkeletonLine heightClass="h-10" />
              <SkeletonLine heightClass="h-8" />
              <SkeletonLine heightClass="h-8" />
              <SkeletonLine heightClass="h-8" />
            </div>
             <div className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-2">
               <SkeletonLine widthClass="w-40" heightClass="h-5" className="mb-1" />
                <SkeletonLine heightClass="h-4" widthClass="w-5/6"/>
                <SkeletonLine heightClass="h-4" widthClass="w-4/6"/>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MicrResultSkeleton;
