import React, { useState, useEffect } from 'react';

export default function FilterPanel({
  activeNav,
  year,
  setYear,
  period,
  setPeriod,
  activeLayer,
  setActiveLayer,
  setTargetLocation,
  showProtected,
  setShowProtected,
  sarOpacity,
  setSarOpacity,
  showCropSuitability,
  setShowCropSuitability,
  permissions = null,
  onTogglePanel = null,
}) {
  const can = (feature) => permissions === null || permissions?.[feature] !== false;
  const [searchInput, setSearchInput]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults]     = useState(false);
  const [availableDatasets, setAvailableDatasets] = useState([]);

  const API = process.env.REACT_APP_API_URL || '${API}';

  useEffect(() => {
    fetch(`${API}/datasets/available`)
      .then(r => r.json())
      .then(data => setAvailableDatasets(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const hasDataset = (y, p) => availableDatasets.some(d => d.year === y && d.period === p);
  const availableYears = [...new Set(availableDatasets.filter(d => d.year).map(d => d.year))].sort((a,b) => b - a);
  const allYears = [...new Set([...availableYears, 2025, 2024, 2023, 2022, 2021])].sort((a,b) => b - a);

  useEffect(() => {
    if (!searchInput.trim()) { setShowResults(false); setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setShowResults(true);
      try {
        const params = new URLSearchParams({
          q: searchInput, format: 'json', limit: 5,
          viewbox: '119.5,15.1,122.8,13.1', bounded: 1,
        });
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
        const data = await res.json();
        setSearchResults(data);
      } catch { setSearchResults([]); }
      setSearchLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const selectResult = (result) => {
    const [south, north, west, east] = result.boundingbox.map(Number);
    const lat = (south + north) / 2;
    const lng = (west + east) / 2;
    setTargetLocation({ lat, lng, zoom: 13 });
    setShowResults(false);
    setSearchInput(result.display_name.split(',').slice(0, 2).join(','));
  };

  if (activeNav !== 'filters') return null;

  return (
    <div className="w-72 lg:w-80 h-screen bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700 flex flex-col shadow-xl z-10 transition-all">
      
      {/* --- Panel Header --- */}
      <div className="p-3 lg:p-4 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <h2 className="text-sm lg:text-base font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            <span className="text-[#1f602e] dark:text-[#a2df87]">Sakahang </span>
            <span className="text-[#d4a017]">Lupa</span>
          </h2>
          <p className="text-[9px] lg:text-[10px] font-medium tracking-wide text-[#1f602e] dark:text-[#a2df87]" style={{ fontFamily: 'Georgia, serif' }}>
            LAND MONITORING SYSTEM
          </p>
        </div>
        {onTogglePanel && (
          <button
            onClick={onTogglePanel}
            className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
            title="Close panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5 lg:space-y-8 bg-white dark:bg-zinc-900">
        
        {/* === Search Location Bar === */}
        <div className="space-y-2 lg:space-y-3">
          <h3 className="text-[10px] lg:text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Search Location</h3>
          <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setShowResults(false); }}
                placeholder="Search a location in CALABARZON…"
                className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg pl-9 pr-3 py-2 text-[10px] lg:text-xs focus:outline-none focus:ring-2 focus:ring-[#305d3d]/30 focus:border-[#305d3d] font-normal text-zinc-500 dark:text-zinc-300 bg-white dark:bg-zinc-800"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {showResults && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-[9999] overflow-hidden">
                  {searchLoading && (
                    <div className="px-4 py-3 text-xs text-zinc-500 flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-[#305d3d] border-t-transparent rounded-full animate-spin" />
                      Searching…
                    </div>
                  )}
                  {!searchLoading && searchResults.length === 0 && (
                    <div className="px-4 py-3 text-xs text-zinc-500">No locations found in CALABARZON.</div>
                  )}
                  {!searchLoading && searchResults.map((r, i) => (
                    <button key={i} type="button" onClick={() => selectResult(r)}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-zinc-50 border-b border-zinc-100 last:border-0 transition-colors">
                      <span className="font-bold text-zinc-800 block truncate">{r.display_name.split(',').slice(0, 2).join(',')}</span>
                      <span className="text-zinc-400 text-[10px]">{r.type} · {r.display_name.split(',').slice(2, 4).join(',')}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* === GROUPED: Year & Season Container === */}
        <div className="space-y-2 p-3 lg:p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl">
          
          {/* Year Selector */}
          <div className="space-y-1.5 lg:space-y-2">
            <h3 className="text-[9px] lg:text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Time Period (Year)</h3>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="w-full p-2 lg:p-2.5 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs lg:text-sm font-medium text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-green-500 focus:outline-none shadow-sm transition-all"
            >
              {allYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Season Radio Buttons */}
          <div className="space-y-1.5 lg:space-y-2 pt-1 lg:pt-2">
            <h3 className="text-[9px] lg:text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Season (Bi-annual)</h3>
            <div className="grid grid-cols-2 gap-2 lg:gap-3">
              {[
                { value: 'Jan-Jun', label: 'Jan - Jun', sub: 'Dry Season' },
                { value: 'Jul-Dec', label: 'Jul - Dec', sub: 'Wet Season' },
              ].map(({ value, label, sub }) => {
                const available = hasDataset(year, value);
                return (
                  <label key={value} className={`flex items-start gap-2 lg:gap-2.5 cursor-pointer group p-2 lg:p-2.5 bg-white dark:bg-zinc-700 border rounded-lg hover:border-green-400 transition-colors ${period === value ? 'border-green-300' : 'border-zinc-200 dark:border-zinc-600'}`}>
                    <input
                      type="radio"
                      name="season"
                      value={value}
                      checked={period === value}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="mt-0.5 w-3 h-3 lg:w-3.5 lg:h-3.5 text-green-500 border-zinc-300 focus:ring-green-500 cursor-pointer accent-green-600"
                    />
                    <div className="flex flex-col flex-1">
                      <span className="text-[10px] lg:text-xs font-bold text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{label}</span>
                      <span className="text-[9px] lg:text-[10px] text-zinc-400 dark:text-zinc-500">{sub}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          
        </div>

        {/* === GROUPED: Classification & Opacity === */}
        <div className="space-y-3 lg:space-y-4"> 
          <div className="space-y-2 lg:space-y-3">
            <h3 className="text-[10px] lg:text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Classifications</h3>
            <select 
              value={activeLayer}
              onChange={(e) => setActiveLayer(e.target.value)}
              className="w-full p-2 lg:p-2.5 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg text-xs lg:text-sm font-medium text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-green-500 focus:outline-none shadow-sm transition-all"
            >
              <option value="all">All</option>
              <option value="agriculture">Agriculture</option>
              <option value="urban">Urban</option>
              <option value="forest">Forest</option>
            </select>
          </div>

          <div className="space-y-1.5 lg:space-y-2"> 
            <div className="flex justify-between items-center">
              <h3 className="text-[9px] lg:text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Layer Opacity</h3>
              <span className="text-[10px] lg:text-xs font-bold text-zinc-700 dark:text-zinc-300">{Math.round(sarOpacity * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={sarOpacity} 
              onChange={(e) => setSarOpacity(parseFloat(e.target.value))}
              className="w-full h-1.5 lg:h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
          </div>
        </div>

        {/* === TOGGLE GROUP: Protected Areas & Crop Suitability === */}
        {(can('protected_areas') || can('crop_suitability')) && (
          <div className="pt-3 lg:pt-4 border-t border-zinc-100 dark:border-zinc-700 space-y-3 lg:space-y-4">

            {can('protected_areas') && (
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-xs lg:text-sm font-bold text-zinc-900 dark:text-zinc-100">Protected Areas</span>
                  <span className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400">Overlay national parks</span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={showProtected}
                    onChange={(e) => setShowProtected(e.target.checked)}
                  />
                  <div className={`block w-9 h-5 lg:w-10 lg:h-6 rounded-full transition-colors ${showProtected ? 'bg-green-500' : 'bg-zinc-200'}`}></div>
                  <div className={`absolute left-0.5 top-0.5 lg:left-1 lg:top-1 bg-white w-4 h-4 rounded-full transition-transform ${showProtected ? 'translate-x-4' : ''}`}></div>
                </div>
              </label>
            )}

            {can('crop_suitability') && (
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-xs lg:text-sm font-bold text-zinc-900 dark:text-zinc-100">Crop Suitability</span>
                  <span className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400">View optimal farming zones</span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={showCropSuitability}
                    onChange={(e) => setShowCropSuitability(e.target.checked)}
                  />
                  <div className={`block w-9 h-5 lg:w-10 lg:h-6 rounded-full transition-colors ${showCropSuitability ? 'bg-green-500' : 'bg-zinc-200'}`}></div>
                  <div className={`absolute left-0.5 top-0.5 lg:left-1 lg:top-1 bg-white w-4 h-4 rounded-full transition-transform ${showCropSuitability ? 'translate-x-4' : ''}`}></div>
                </div>
              </label>
            )}

          </div>
        )}
      </div>
    </div>
  );
}