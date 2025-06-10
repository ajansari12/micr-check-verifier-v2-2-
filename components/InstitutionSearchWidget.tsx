
import React, { useState, useEffect } from 'react';
import { searchInstitutions, CanadianInstitution } from '../services/canadianBankingDatabase';

const InstitutionSearchWidget = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CanadianInstitution[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (query.length >= 2) {
        setIsSearching(true);
        const searchResults = searchInstitutions(query);
        setResults(searchResults);
        setIsSearching(false);
      } else {
        setResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [query]);

  return (
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-6 my-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-blue-800">
          🏦 Canadian Financial Institution Directory
        </h3>
        <span className="text-sm text-slate-500">
          {results.length > 0 ? `${results.length} institution(s) found` : 'Enter search term below'}
        </span>
      </div>

      <div className="relative mb-4">
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth={1.5} 
            stroke="currentColor" 
            className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Name, Institution #, Location, SWIFT..."
          className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          aria-label="Search Canadian Financial Institutions"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" role="status" aria-label="Searching"></div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {results.map((institution) => (
            <div 
              key={institution.institutionNumber}
              className="p-4 border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow bg-slate-50"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                {/* Left Column: Main Info */}
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-12 h-12 bg-blue-700 rounded-lg flex items-center justify-center shadow">
                      <span className="text-white font-bold text-lg">
                        {institution.shortName.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-blue-900 text-lg">
                        {institution.commonName}
                      </h4>
                      <p className="text-xs text-slate-600 italic">{institution.name}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div>
                      <span className="text-slate-500 font-medium">Inst. #:</span>
                      <span className="ml-1 font-mono text-slate-700">
                        {institution.institutionNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Type:</span>
                      <span className="ml-1 text-slate-700">{institution.type}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">HQ:</span>
                      <span className="ml-1 text-slate-700">{institution.headquarters}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Insurance:</span>
                      <span className={`ml-1 font-semibold ${institution.cdic ? 'text-green-700' : 'text-amber-700'}`}>
                        {institution.depositInsurance}
                      </span>
                    </div>
                     <div>
                      <span className="text-slate-500 font-medium">Regulator:</span>
                      <span className="ml-1 text-slate-700">{institution.regulatoryBody}</span>
                    </div>
                     <div>
                      <span className="text-slate-500 font-medium">Status:</span>
                      <span className={`ml-1 font-semibold ${institution.status === 'Active' ? 'text-green-700' : 'text-orange-600'}`}>{institution.status}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Actions & Quick Info */}
                <div className="text-left sm:text-right mt-3 sm:mt-0 space-y-1.5">
                  <a
                    href={institution.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 mr-1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                    Website
                  </a>
                  <a
                    href={`tel:${institution.customerService.replace(/\s/g, '')}`} // Remove spaces for tel link
                    className="block text-blue-700 hover:underline text-sm"
                  >
                    <span className="font-medium">CS:</span> {institution.customerService}
                  </a>
                  {institution.verificationPhone && (
                     <a
                      href={`tel:${institution.verificationPhone.replace(/\s/g, '')}`}
                      className="block text-green-700 hover:underline text-sm"
                    >
                      <span className="font-medium">Verify:</span> {institution.verificationPhone}
                    </a>
                  )}
                   {institution.fraudReportingPhone && (
                     <a
                      href={`tel:${institution.fraudReportingPhone.replace(/\s/g, '')}`}
                      className="block text-red-700 hover:underline text-sm"
                    >
                      <span className="font-medium">Fraud:</span> {institution.fraudReportingPhone}
                    </a>
                  )}
                </div>
              </div>

              {institution.specialNotes && (
                <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-md text-xs">
                  <p className="text-amber-800 font-medium">Note:</p>
                  <p className="text-amber-700">{institution.specialNotes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="mt-6 p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-slate-400 mb-3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          <p className="font-medium">No Institutions Found</p>
          <p className="text-sm">Your search for "{query}" did not match any institutions in our directory.</p>
        </div>
      )}
       {query.length < 2 && results.length === 0 && !isSearching && (
        <div className="mt-6 p-6 text-center text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-slate-300 mb-3"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-4.063V18" /></svg>
            <p className="font-medium">Start Searching</p>
            <p className="text-sm">Enter at least 2 characters to begin searching the directory.</p>
        </div>
      )}
    </div>
  );
};

export default InstitutionSearchWidget;
