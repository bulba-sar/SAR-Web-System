import React, { useState } from 'react';

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
  // === NEW PROPS ===
  showCropSuitability, 
  setShowCropSuitability 
}) {
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchInput.trim()) return;

    setIsSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchInput}, CALABARZON, Philippines`);
      const data = await response.json();

      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setTargetLocation({ lat: parseFloat(lat), lng: parseFloat(lon), zoom: 13 });
      } else {
        setSearchError('Location not found. Try a municipality or barangay name.');
      }
    } catch (error) {
      setSearchError('Search failed. Check your connection.');
    }
    setIsSearching(false);
  };

  if (activeNav !== 'filters') return null;

  return (
    <div className="w-72 lg:w-80 h-screen bg-white border-r border-zinc-200 flex flex-col shadow-xl z-10 transition-all">
      
      {/* --- Panel Header --- */}
      <div className="p-4 lg:p-6 border-b border-zinc-200 bg-zinc-50 flex items-center gap-3">
        <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg bg-[#4e7a59]/10 flex items-center justify-center text-[#4e7a59]">
          <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </div>
        <div>
          <h2 className="text-xs lg:text-sm font-bold text-zinc-900">Map Filters</h2>
          <p className="text-[10px] lg:text-xs text-zinc-500">Customize LULC view</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5 lg:space-y-8 bg-white">
        
        {/* === Search Location Bar === */}
        <div className="space-y-2 lg:space-y-3">
          <h3 className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase tracking-wider">Search Location</h3>
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setSearchError(''); }}
              placeholder={isSearching ? "Searching..." : "Find municipality..."}
              disabled={isSearching}
              className={`w-full pl-9 lg:pl-10 pr-3 lg:pr-4 py-2 lg:py-2.5 bg-white border rounded-lg text-xs lg:text-sm font-medium text-zinc-900 focus:ring-2 focus:ring-green-500 focus:outline-none shadow-sm disabled:opacity-50 transition-all ${searchError ? 'border-red-300' : 'border-zinc-200'}`}
            />
            <button type="submit" className="absolute left-2.5 lg:left-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-green-500">
              <svg className="w-3.5 h-3.5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
          {searchError && (
            <p className="text-[10px] lg:text-xs text-red-500 font-medium mt-1 px-1">{searchError}</p>
          )}
        </div>

        {/* === GROUPED: Year & Season Container === */}
        <div className="space-y-2 p-3 lg:p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
          
          {/* Year Selector */}
          <div className="space-y-1.5 lg:space-y-2">
            <h3 className="text-[9px] lg:text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Time Period (Year)</h3>
            <select 
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="w-full p-2 lg:p-2.5 bg-white border border-zinc-200 rounded-lg text-xs lg:text-sm font-medium text-zinc-900 focus:ring-2 focus:ring-green-500 focus:outline-none shadow-sm transition-all"
            >
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
              <option value={2023}>2023</option>
              <option value={2022}>2022</option>
              <option value={2021}>2021</option>
            </select>
          </div>

          {/* Season Radio Buttons */}
          <div className="space-y-1.5 lg:space-y-2 pt-1 lg:pt-2">
            <h3 className="text-[9px] lg:text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Season (Bi-annual)</h3>
            <div className="grid grid-cols-2 gap-2 lg:gap-3">
              <label className="flex items-start gap-2 lg:gap-2.5 cursor-pointer group p-2 lg:p-2.5 bg-white border border-zinc-200 rounded-lg hover:border-green-400 transition-colors">
                <input 
                  type="radio" 
                  name="season" 
                  value="Jan-Jun"
                  checked={period === "Jan-Jun"}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="mt-0.5 w-3 h-3 lg:w-3.5 lg:h-3.5 text-green-500 border-zinc-300 focus:ring-green-500 cursor-pointer accent-green-600"
                />
                <div className="flex flex-col">
                  <span className="text-[10px] lg:text-xs font-bold text-zinc-700 group-hover:text-zinc-900 transition-colors">Jan - Jun</span>
                  <span className="text-[9px] lg:text-[10px] text-zinc-400">Dry Season</span>
                </div>
              </label>

              <label className="flex items-start gap-2 lg:gap-2.5 cursor-pointer group p-2 lg:p-2.5 bg-white border border-zinc-200 rounded-lg hover:border-green-400 transition-colors">
                <input 
                  type="radio" 
                  name="season" 
                  value="Jul-Dec"
                  checked={period === "Jul-Dec"}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="mt-0.5 w-3 h-3 lg:w-3.5 lg:h-3.5 text-green-500 border-zinc-300 focus:ring-green-500 cursor-pointer accent-green-600"
                />
                <div className="flex flex-col">
                  <span className="text-[10px] lg:text-xs font-bold text-zinc-700 group-hover:text-zinc-900 transition-colors">Jul - Dec</span>
                  <span className="text-[9px] lg:text-[10px] text-zinc-400">Wet Season</span>
                </div>
              </label>
            </div>
          </div>
          
        </div>

        {/* === GROUPED: Classification & Opacity === */}
        <div className="space-y-3 lg:space-y-4"> 
          <div className="space-y-2 lg:space-y-3">
            <h3 className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase tracking-wider">Classifications</h3>
            <select 
              value={activeLayer}
              onChange={(e) => setActiveLayer(e.target.value)}
              className="w-full p-2 lg:p-2.5 bg-white border border-zinc-200 rounded-lg text-xs lg:text-sm font-medium text-zinc-900 focus:ring-2 focus:ring-green-500 focus:outline-none shadow-sm transition-all"
            >
              <option value="all">All</option>
              <option value="agriculture">Agriculture</option>
              <option value="urban">Urban</option>
              <option value="forest">Forest</option>
            </select>
          </div>

          <div className="space-y-1.5 lg:space-y-2"> 
            <div className="flex justify-between items-center">
              <h3 className="text-[9px] lg:text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Layer Opacity</h3>
              <span className="text-[10px] lg:text-xs font-bold text-zinc-700">{Math.round(sarOpacity * 100)}%</span>
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
        <div className="pt-3 lg:pt-4 border-t border-zinc-100 space-y-3 lg:space-y-4">
          
          {/* Protected Areas Toggle */}
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex flex-col">
              <span className="text-xs lg:text-sm font-bold text-zinc-900">Protected Areas</span>
              <span className="text-[10px] lg:text-xs text-zinc-500">Overlay national parks</span>
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

          {/* === NEW: Crop Suitability Toggle === */}
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex flex-col">
              <span className="text-xs lg:text-sm font-bold text-zinc-900">Crop Suitability</span>
              <span className="text-[10px] lg:text-xs text-zinc-500">View optimal farming zones</span>
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

        </div>
      </div>
    </div>
  );
}