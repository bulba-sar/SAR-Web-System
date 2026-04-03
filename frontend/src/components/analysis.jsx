import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Global Center for Calabarzon
const CALABARZON_CENTER = [14.1008, 121.3259];

// === Sub-Component: Leaflet Mini Map ===
const CalabarzonMiniMap = ({ geoData }) => {
  const mapStyle = (feature) => {
    const colors = {
      'Forest': "#15803d",
      'Urban': "#b91c1c",
      'Agriculture': "#eab308"
    };
    return {
      color: colors[feature.properties.class] || "#94a3b8",
      weight: 1,
      fillOpacity: 0.7
    };
  };

  return (
    <div className="relative w-full h-[418px] bg-zinc-900 border border-zinc-100 rounded-xl overflow-hidden shadow-inner">
      <MapContainer
        center={CALABARZON_CENTER}
        zoom={8}
        scrollWheelZoom={false}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {geoData && <GeoJSON data={geoData} style={mapStyle} />}
      </MapContainer>

      {/* Mini Legend Overlay */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-sm text-[10px] font-bold space-y-1.5 border border-zinc-200">
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-green-700 rounded-sm"></div> Forest</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-yellow-500 rounded-sm"></div> Agriculture</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-red-600 rounded-sm"></div> Urban</div>
      </div>
    </div>
  );
};

// === Helper: Donut Chart Mock ===
const DonutChartMock = ({ spentPercentExact, spentPercentPhrase }) => {
  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <div className="w-full h-full rounded-full bg-blue-100 flex items-center justify-center">
        <div className="w-3/4 h-3/4 rounded-full bg-white flex flex-col items-center justify-center">
          <p className="text-sm font-black text-zinc-900">{spentPercentPhrase}%</p>
          <p className="text-xs text-zinc-500">Phrase</p>
          <p className="text-sm font-black text-zinc-900 mt-1">{spentPercentExact}%</p>
          <p className="text-xs text-zinc-500">Exact</p>
        </div>
      </div>
    </div>
  );
};

// === MAIN ANALYSIS COMPONENT ===
export default function Analysis() {
  // --- 1. STATE VARIABLES ---
  const [activeTab, setActiveTab] = useState('keywords');
  const [selectedYear, setSelectedYear] = useState('2025');
  const [selectedSeason, setSelectedSeason] = useState('Jan-Jun');
  
  // Map Data State
  const [geoData, setGeoData] = useState(null);
  const [isLoadingMap, setIsLoadingMap] = useState(true);

  // --- 2. FETCH LOGIC ---
  useEffect(() => {
    const fetchMapData = async () => {
      try {
        setIsLoadingMap(true);
        // Replace with your actual GeoJSON path
        const response = await fetch('/data/calabarzon_sar.geojson'); 
        const data = await response.json();
        setGeoData(data);
      } catch (error) {
        console.error("Error loading GeoJSON:", error);
      } finally {
        setIsLoadingMap(false);
      }
    };
    fetchMapData();
  }, []);

  // Hardcoded table data
  const matchTypeData = [
    { type: 'Phrase', conversionsPercent: 68.86, costPercent: 71 },
    { type: 'Exact', conversionsPercent: 31.14, costPercent: 29 },
  ];

  const keywordData = [
    { term: 'seo looker studio template', clicks: 8, clicksChange: 700.0, ctr: 10, ctrChange: 92.8, cpc: 3.03, cpcChange: 1.2, cost: 24.27, costChange: 1226.2 },
    { term: 'google looker studio templates', clicks: 8, clicksChange: 166.7, ctr: 10, ctrChange: -39.0, cpc: 2.78, cpcChange: 0.82, cost: 22.2, costChange: 278.8 },
    { term: 'ga4 looker studio template', clicks: 7, clicksChange: 0.0, ctr: 9, ctrChange: 0.0, cpc: 1.9, cpcChange: 1.9, cost: 13.32, costChange: 0.0 },
    { term: 'looker studio templates for ga4', clicks: 6, clicksChange: 0.0, ctr: 22, ctrChange: 0.0, cpc: 1.81, cpcChange: 0.0, cost: 10.85, costChange: 0.0 },
    { term: 'looker studio seo template', clicks: 4, clicksChange: 300.0, ctr: 8, ctrChange: 44.0, cpc: 3.15, cpcChange: 1.4, cost: 12.61, costChange: 620.6 },
    { term: 'looker studio seo', clicks: 4, clicksChange: 0.0, ctr: 10, ctrChange: 0.0, cpc: 2.23, cpcChange: 8.92, cost: 8.92, costChange: 0.0 },
    { term: 'google data studio dashboard examples', clicks: 3, clicksChange: 0.0, ctr: 17, ctrChange: 0.0, cpc: 3.17, cpcChange: 3.17, cost: 9.5, costChange: 0.0 },
    { term: 'ga4 template looker studio', clicks: 3, clicksChange: 200.0, ctr: 18, ctrChange: -64.7, cpc: 1.79, cpcChange: -0.21, cost: 5.38, costChange: 169.0 },
  ];

  const grandTotal = {
    clicks: 380, clicksChange: 533.3, ctr: 7, ctrChange: -4.1, cpc: 2.65, cpcChange: -2.87, cost: 1007.02, costChange: 204.3
  };

  // --- 3. RENDER LOGIC ---
  return (
    <div className="w-full h-full relative z-0 bg-white p-8 space-y-8 overflow-y-auto">
      
      {/* 1. Header Section */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-6 mb-8">
        <h2 className="text-2xl font-black text-zinc-900 leading-tight">Analysis Dashboard</h2>
        <div className="flex items-center gap-4">
          <div className="relative flex items-center mr-2">
            <svg className="w-4 h-4 text-zinc-400 absolute left-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search data..." 
              className="text-sm bg-zinc-50 border border-zinc-200 text-zinc-800 rounded-lg pl-9 pr-4 py-2 w-96 focus:outline-none focus:ring-2 focus:ring-[#1d5e3a]/30 focus:border-[#1d5e3a] focus:bg-white transition-all placeholder:text-zinc-400"
            />
          </div>
          <button className="font-bold text-sm bg-white text-[#23432f] border border-[#23432f] px-4 py-2 rounded-lg hover:bg-zinc-50 transition shadow-sm">
            Share
          </button>
          <button className="flex items-center gap-2 text-white font-bold text-sm bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-4 py-2 rounded-lg hover:opacity-90 transition shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export Data
          </button>
        </div>
      </div>

      {/* 2. Control Row */}
      <div className="flex items-stretch justify-start gap-2">
        {/* Year Dropdown */}
        <div className="flex items-center gap-3 bg-zinc-50 p-2 rounded-xl border border-zinc-100">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider ml-2">Year</span>
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="text-sm font-bold text-zinc-800 bg-white px-4 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:border-[#1d5e3a] focus:ring-1 focus:ring-[#1d5e3a] cursor-pointer outline-none"
          >
            {[2025, 2024, 2023, 2022, 2021, 2020].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        {/* Season Radio Buttons */}
        <div className="flex items-center gap-3 bg-zinc-50 p-2 rounded-xl border border-zinc-100 px-4">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider ml-2">Season</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer hover:text-[#1d5e3a] transition">
              <input type="radio" name="season" value="Jan-Jun" checked={selectedSeason === 'Jan-Jun'} onChange={(e) => setSelectedSeason(e.target.value)} className="w-4 h-4 accent-[#1d5e3a] cursor-pointer" />
              Dry : Jan-Jun
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer hover:text-[#1d5e3a] transition">
              <input type="radio" name="season" value="Jul-Dec" checked={selectedSeason === 'Jul-Dec'} onChange={(e) => setSelectedSeason(e.target.value)} className="w-4 h-4 accent-[#1d5e3a] cursor-pointer" />
              Wet : Jul-Dec
            </label>
          </div>
        </div>

        {/* Classification Filter Box */}
        <div className="flex-1 flex items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-100">
          <div className="flex items-center gap-8">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Classification</span>
            <div className="flex items-center gap-6">
              {['Agriculture', 'Urban', 'Forest'].map((label) => (
                <label key={label} className="flex items-center gap-2.5 text-sm font-bold text-zinc-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-zinc-300 text-[#1d5e3a] accent-[#1d5e3a]" defaultChecked />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 pl-6 border-l border-zinc-200">
            <button className="text-xs font-bold text-[#23432f] bg-white border border-[#23432f] px-4 py-2 rounded-lg hover:bg-zinc-100 transition">Clear Filter</button>
            <button className="text-xs font-bold text-white bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-5 py-2 rounded-lg hover:opacity-90 transition shadow-sm">Apply</button>
          </div>
        </div>
      </div>

      {/* 3. Upper Content Grid */}
      <div className="grid grid-cols-[1fr,2fr] gap-6">
        <div className="space-y-6">
          <div className="flex gap-2 p-2 bg-zinc-50 rounded-xl border border-zinc-100">
            <button onClick={() => setActiveTab('keywords')} className={`flex-1 text-sm font-bold px-4 py-2 rounded-lg transition ${activeTab === 'keywords' ? 'bg-white text-green-700 shadow border border-green-100' : 'text-zinc-600 hover:text-green-700'}`}>Keywords</button>
            <button onClick={() => setActiveTab('landing')} className={`flex-1 text-sm font-bold px-4 py-2 rounded-lg transition ${activeTab === 'landing' ? 'bg-white text-green-700 shadow border border-green-100' : 'text-zinc-600 hover:text-green-700'}`}>Landing Page</button>
          </div>

          <div className="border border-zinc-100 rounded-lg p-6 bg-zinc-50">
            <h4 className="text-sm font-black text-zinc-800 mb-6 tracking-wide uppercase">Match Type Analysis</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="text-left py-2.5 font-bold text-zinc-500">Match type</th>
                  <th className="text-right py-2.5 font-bold text-zinc-500">% Conversions</th>
                  <th className="text-right py-2.5 font-bold text-zinc-500">% Cost</th>
                </tr>
              </thead>
              <tbody>
                {matchTypeData.map(row => (
                  <tr key={row.type} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-100/50 transition">
                    <td className="py-2.5 text-zinc-800 font-medium">{row.type}</td>
                    <td className="text-right py-2.5 text-zinc-800 font-mono">{row.conversionsPercent}%</td>
                    <td className="text-right py-2.5 text-zinc-800 font-mono">{row.costPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-zinc-100 rounded-lg p-6 bg-zinc-50 space-y-4">
            <h4 className="text-sm font-black text-zinc-800 uppercase">Spent By Match Type</h4>
            <div className="flex items-center justify-around gap-6">
                <DonutChartMock spentPercentPhrase={71.1} spentPercentExact={28.9} />
                <div className="space-y-3 min-w-[120px]">
                    <p className="text-zinc-700 font-medium flex items-center gap-3 text-sm"><i className="w-3.5 h-3.5 rounded-full bg-blue-500"></i> Exact <span className="text-zinc-900 ml-auto font-black font-mono">28.9%</span></p>
                    <p className="text-zinc-700 font-medium flex items-center gap-3 text-sm"><i className="w-3.5 h-3.5 rounded-full bg-blue-100"></i> Phrase <span className="text-zinc-900 ml-auto font-black font-mono">71.1%</span></p>
                </div>
            </div>
          </div>
        </div>

        {/* Right Column (Mini Map) */}
        <div className="space-y-6">
            {isLoadingMap ? (
              <div className="w-full h-[418px] bg-zinc-900 rounded-xl border border-zinc-100 flex flex-col items-center justify-center gap-3">
                 <div className="w-8 h-8 border-4 border-t-[#1d5e3a] border-zinc-700 rounded-full animate-spin"></div>
                 <p className="text-xs font-bold text-zinc-500 tracking-widest uppercase">Loading SAR Layers...</p>
              </div>
            ) : (
              <CalabarzonMiniMap geoData={geoData} />
            )}
        </div>
      </div>

      {/* 4. Keyword Table */}
      <div className="border border-zinc-100 rounded-lg p-6 bg-zinc-50 overflow-x-auto">
        <div className="flex items-center justify-between mb-6 border-b border-zinc-100 pb-4">
            <h4 className="text-sm font-black text-zinc-800 uppercase">Deep Dive Keyword Analysis</h4>
        </div>
        <table className="w-full text-xs font-mono">
          <thead className="bg-white border border-zinc-100">
            <tr className="border-b border-zinc-200">
              <th className="text-left px-3.5 py-3 font-bold text-zinc-500 min-w-[220px]">Search term ▼</th>
              <th className="text-right px-3.5 py-3 font-bold text-zinc-500">Clicks</th>
              <th className="text-right px-3.5 py-3 font-bold text-zinc-500">% ∆</th>
              <th className="text-right px-3.5 py-3 font-bold text-zinc-500">CTR</th>
              <th className="text-right px-3.5 py-3 font-bold text-zinc-500">% ∆</th>
              <th className="text-right px-3.5 py-3 font-bold text-zinc-500">Avg. CPC</th>
              <th className="text-right px-3.5 py-3 font-bold text-zinc-500">Cost</th>
            </tr>
          </thead>
          <tbody>
            {keywordData.map((row, index) => (
              <tr key={index} className="bg-white border-b border-zinc-100 hover:bg-zinc-100 transition">
                <td className="px-3.5 py-2.5 text-zinc-800 font-sans">{index + 1}. {row.term}</td>
                <td className="text-right px-3.5 py-2.5 text-zinc-800 font-bold">{row.clicks}</td>
                <td className={`text-right px-3.5 py-2.5 font-black ${row.clicksChange > 0 ? 'text-green-700' : 'text-zinc-800'}`}>{row.clicksChange.toFixed(1)}%</td>
                <td className="text-right px-3.5 py-2.5 text-zinc-800 font-bold">{row.ctr}%</td>
                <td className={`text-right px-3.5 py-2.5 font-black ${row.ctrChange > 0 ? 'text-green-700' : 'text-red-700'}`}>{row.ctrChange.toFixed(1)}%</td>
                <td className="text-right px-3.5 py-2.5 text-zinc-800 font-bold bg-blue-100/50">€{row.cpc.toFixed(2)}</td>
                <td className="text-right px-3.5 py-2.5 text-zinc-800 font-bold bg-blue-100/50">€{row.cost.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-zinc-100/80 font-black border border-zinc-200">
                <td className="px-3.5 py-3.5 uppercase tracking-widest">Grand total</td>
                <td className="text-right px-3.5 py-3.5 font-black">{grandTotal.clicks}</td>
                <td className="text-right px-3.5 py-3.5 text-green-800">{grandTotal.clicksChange.toFixed(1)}%</td>
                <td className="text-right px-3.5 py-3.5 font-black">{grandTotal.ctr}%</td>
                <td className="text-right px-3.5 py-3.5 text-red-800">{grandTotal.ctrChange.toFixed(1)}%</td>
                <td className="text-right px-3.5 py-3.5">€{grandTotal.cpc.toFixed(2)}</td>
                <td className="text-right px-3.5 py-3.5 font-black">€{grandTotal.cost.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}