import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { MapContainer, TileLayer, useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const calabarzonBounds = [
  [13.1000, 119.5000],
  [15.1000, 122.8000]
];

const CLASS_COLORS = {
  Water: '#1d4ed8',
  Urban: '#dc2626',
  Forest: '#15803d',
  Agriculture: '#ca8a04'
};

const CLASS_ORDER = ['Water', 'Urban', 'Forest', 'Agriculture'];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const INTENSITY_COLORS = {
  'Fallow / Inactive': { bg: 'bg-zinc-100', text: 'text-zinc-600', border: 'border-zinc-300' },
  'Single Crop': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  'Double Crop': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300' },
  'Triple Crop / Intensive': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
};

const CONFIDENCE_COLORS = {
  High: 'bg-green-100 text-green-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-zinc-100 text-zinc-600'
};

// ============================================================
//  MAP SUB-COMPONENTS (unchanged)
// ============================================================

const MapControls = ({ bounds, isDrawing, setIsDrawing }) => {
  const map = useMap();
  return (
    <div className="absolute top-3 right-3 lg:top-4 lg:right-4 z-[1000] flex flex-col shadow-lg rounded-lg overflow-hidden border border-white/10">
      <button onClick={() => setIsDrawing(!isDrawing)} title={isDrawing ? "Click on map to draw, Double-click to finish" : "Draw Study Area"} className={`w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center transition-all border-b border-white/10 ${isDrawing ? 'bg-green-600 text-white' : 'bg-zinc-900/80 hover:bg-zinc-700 text-zinc-400 hover:text-white backdrop-blur-sm'}`}>
        <svg className="w-3.5 h-3.5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
      </button>
      <button onClick={() => map.zoomIn()} className="w-7 h-7 lg:w-8 lg:h-8 bg-zinc-900/80 hover:bg-zinc-700 backdrop-blur-sm flex items-center justify-center text-white transition-all border-b border-white/10">
        <svg className="w-3.5 h-3.5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
      </button>
      <button onClick={() => map.zoomOut()} className="w-7 h-7 lg:w-8 lg:h-8 bg-zinc-900/80 hover:bg-zinc-700 backdrop-blur-sm flex items-center justify-center text-white transition-all border-b border-white/10">
        <svg className="w-3.5 h-3.5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
      </button>
      <button onClick={() => map.fitBounds(bounds)} className="w-7 h-7 lg:w-8 lg:h-8 bg-zinc-900/80 hover:bg-zinc-700 backdrop-blur-sm flex items-center justify-center text-zinc-400 hover:text-white transition-all">
        <svg className="w-3 h-3 lg:w-3.5 lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>
    </div>
  );
};

const CalabarzonMiniMap = ({ sarUrl, basemapUrl, sarOpacity, setSarOpacity, drawnPolygon, setDrawnPolygon }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isDrawing) return;
    let points = [];
    const tempPolygon = L.polygon([], { color: '#1d5e3a', weight: 3, dashArray: '5, 5' }).addTo(map);
    const onMapClick = (e) => { points.push(e.latlng); tempPolygon.setLatLngs(points); };
    const onMapDblClick = () => {
      points.pop();
      if (points.length >= 3) { setDrawnPolygon([...points]); setIsDrawing(false); }
      else { alert("Please click at least 3 distinct points."); }
      map.removeLayer(tempPolygon);
    };
    map.on('click', onMapClick);
    map.on('dblclick', onMapDblClick);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', onMapClick); map.off('dblclick', onMapDblClick);
      map.getContainer().style.cursor = '';
      if (map.hasLayer(tempPolygon)) map.removeLayer(tempPolygon);
    };
  }, [isDrawing, setDrawnPolygon]);

  return (
    <div className="relative w-full h-[300px] lg:h-[418px] bg-[#172229] border border-zinc-200 rounded-xl overflow-hidden shadow-inner">
      {isDrawing && <div className="absolute top-0 left-0 w-full bg-green-600/90 text-white text-[10px] lg:text-xs font-bold text-center py-1.5 z-[2000] backdrop-blur-sm shadow-md animate-pulse">DRAW MODE: Click points on the map. Double-click to finish.</div>}
      <MapContainer bounds={calabarzonBounds} scrollWheelZoom={false} doubleClickZoom={false} className="h-full w-full z-0" zoomControl={false} style={{ backgroundColor: '#172229' }} ref={mapRef}>
        {basemapUrl && <TileLayer key={basemapUrl} url={basemapUrl} attribution="&copy; GEE" />}
        {sarUrl && <TileLayer key={sarUrl + sarOpacity} url={sarUrl} opacity={sarOpacity} attribution="SAR Data" />}
        {drawnPolygon && <Polygon positions={drawnPolygon} pathOptions={{ color: '#1d5e3a', fillColor: '#1d5e3a', fillOpacity: 0.3, weight: 3 }} />}
        <MapControls bounds={calabarzonBounds} isDrawing={isDrawing} setIsDrawing={setIsDrawing} />
      </MapContainer>
      <div className="absolute bottom-3 left-3 lg:bottom-4 lg:left-4 z-[1000] bg-zinc-900/80 backdrop-blur-sm p-2 lg:p-3 rounded-lg border border-white/10 flex items-center gap-3 shadow-xl">
        <span className="text-[9px] lg:text-[10px] font-bold text-white uppercase tracking-wider">Opacity</span>
        <input type="range" min="0" max="1" step="0.1" value={sarOpacity} onChange={(e) => setSarOpacity(parseFloat(e.target.value))} className="w-20 lg:w-28 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#1d5e3a]" />
        <span className="text-[10px] lg:text-xs font-black font-mono text-white w-8">{Math.round(sarOpacity * 100)}%</span>
      </div>
      <div className="absolute bottom-3 right-3 lg:bottom-4 lg:right-4 z-[1000] bg-zinc-900/80 backdrop-blur-sm p-2 lg:p-3 rounded-lg shadow-sm text-[9px] lg:text-[10px] font-bold space-y-1 lg:space-y-1.5 border border-white/10">
        {Object.entries(CLASS_COLORS).map(([cls, color]) => (
          <div key={cls} className="flex items-center gap-2"><div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-sm" style={{ backgroundColor: color }}></div><span className="text-white">{cls}</span></div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
//  REUSABLE UI COMPONENTS
// ============================================================

const ClassBar = ({ label, percentage, color, pixelCount }) => (
  <div className="space-y-1">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }}></div>
        <span className="text-xs lg:text-sm font-bold text-zinc-800">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] lg:text-xs text-zinc-400 font-mono">{pixelCount?.toLocaleString() || 0} px</span>
        <span className="text-xs lg:text-sm font-black text-zinc-900 w-14 text-right">{percentage}%</span>
      </div>
    </div>
    <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${percentage}%`, backgroundColor: color }}></div>
    </div>
  </div>
);

const ChangeIndicator = ({ current, previous }) => {
  if (previous === null || previous === undefined) return <span className="text-[10px] text-zinc-400">—</span>;
  const diff = (current - previous).toFixed(2);
  const isPositive = diff > 0;
  const isZero = parseFloat(diff) === 0;
  if (isZero) return <span className="text-[10px] lg:text-xs text-zinc-400 font-mono">0.00</span>;
  return (
    <span className={`text-[10px] lg:text-xs font-bold font-mono ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? '▲' : '▼'} {Math.abs(diff)}%
    </span>
  );
};

// Simple inline bar chart for NDVI / SAR timelines
const TimelineChart = ({ data, dataKey, color, label, unit, minVal, maxVal }) => {
  const values = data.map(d => d[dataKey]);
  const validValues = values.filter(v => v !== null && v !== undefined);
  const chartMin = minVal ?? Math.min(...validValues, 0);
  const chartMax = maxVal ?? Math.max(...validValues, 1);
  const range = chartMax - chartMin || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className="text-[9px] lg:text-[10px] text-zinc-400">{unit}</span>
      </div>
      <div className="flex items-end gap-[2px] h-16 lg:h-20">
        {data.map((entry, i) => {
          const val = entry[dataKey];
          const height = val !== null && val !== undefined
            ? Math.max(((val - chartMin) / range) * 100, 2)
            : 0;
          const isPeak = entry.isPeak;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${MONTH_LABELS[i]}: ${val !== null ? val : 'N/A'}`}>
              <div className="w-full relative flex items-end justify-center" style={{ height: '100%' }}>
                <div
                  className={`w-full rounded-t-sm transition-all duration-500 ${isPeak ? 'ring-2 ring-offset-1 ring-amber-400' : ''}`}
                  style={{
                    height: `${height}%`,
                    backgroundColor: val !== null ? color : '#e4e4e7',
                    opacity: val !== null ? 1 : 0.3,
                    minHeight: val !== null ? '2px' : '1px'
                  }}
                ></div>
              </div>
              <span className="text-[7px] lg:text-[8px] text-zinc-400 font-mono">{MONTH_LABELS[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Empty / Loading / Error states
const EmptyState = ({ message, sub }) => (
  <div className="flex flex-col items-center justify-center h-[300px] lg:h-[418px] border border-dashed border-zinc-200 rounded-xl bg-zinc-50 text-center px-6">
    <svg className="w-12 h-12 lg:w-16 lg:h-16 text-zinc-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    <p className="text-sm lg:text-base font-bold text-zinc-400">{message}</p>
    {sub && <p className="text-xs lg:text-sm text-zinc-400 mt-1">{sub}</p>}
  </div>
);

const LoadingState = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-[300px] lg:h-[418px] border border-zinc-200 rounded-xl bg-zinc-50">
    <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
    <p className="text-sm font-bold text-zinc-600">{message}</p>
    <p className="text-xs text-zinc-400 mt-1">This may take 30-60 seconds depending on area size and year range</p>
  </div>
);

const ErrorState = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-[300px] lg:h-[418px] border border-red-200 rounded-xl bg-red-50 text-center px-6">
    <svg className="w-10 h-10 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
    <p className="text-sm font-bold text-red-700">Analysis Error</p>
    <p className="text-xs text-red-600 mt-1 max-w-sm">{message}</p>
  </div>
);


// ============================================================
//  CROP AREA CHART HELPERS
// ============================================================

const cropBarColor = (pct) => {
  if (pct >= 70) return '#2d6a4f';
  if (pct >= 50) return '#40916c';
  if (pct >= 30) return '#74c69d';
  return '#b7e4c7';
};

const CropAreaBar = (props) => {
  const { x, y, width, height, crop_percentage } = props;
  if (!height || height <= 0) return null;
  return <rect x={x} y={y} width={width} height={height} fill={cropBarColor(crop_percentage)} rx={5} ry={5} />;
};

const CropAreaTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-black text-zinc-900 mb-1">{d.year}</p>
      <p className="text-zinc-600">Crop Coverage: <strong className="text-zinc-900">{d.crop_percentage}%</strong></p>
      <p className="text-zinc-600">Crop Area: <strong className="text-zinc-900">{d.crop_area_ha} ha</strong></p>
      <p className="text-zinc-600">Total Area: <strong className="text-zinc-900">{d.total_area_ha} ha</strong></p>
    </div>
  );
};

// ============================================================
//  MAIN ANALYSIS COMPONENT
// ============================================================

export default function Analysis({ sarUrl, basemapUrl }) {
  const [activeTab, setActiveTab] = useState('lulc'); // 'lulc' | 'crop'
  const [startYear, setStartYear] = useState('2022');
  const [endYear, setEndYear] = useState('2023');
  const [selectedSeason, setSelectedSeason] = useState('all');
  const [sarOpacity, setSarOpacity] = useState(0.8);
  const [drawnPolygon, setDrawnPolygon] = useState(null);

  // LULC state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  // Crop Intensity state (SAR/NDVI timelines)
  const [cropData, setCropData] = useState(null);
  const [isCropAnalyzing, setIsCropAnalyzing] = useState(false);
  const [cropError, setCropError] = useState(null);

  // Crop Area Coverage state (bar chart — both-semester Agriculture pixels)
  const [cropAreaData, setCropAreaData] = useState(null);
  const [cropAreaError, setCropAreaError] = useState(null);

  // ── LULC Computed Values ──
  const overallSummary = useMemo(() => {
    if (!analyticsData || analyticsData.length === 0) return null;
    const totals = {};
    let grandTotal = 0;
    analyticsData.forEach(entry => {
      Object.entries(entry.classes).forEach(([className, data]) => {
        totals[className] = (totals[className] || 0) + data.pixel_count;
        grandTotal += data.pixel_count;
      });
    });
    if (grandTotal === 0) return null;
    const classes = {};
    Object.entries(totals).forEach(([className, pixelCount]) => {
      classes[className] = {
        percentage: parseFloat(((pixelCount / grandTotal) * 100).toFixed(2)),
        pixel_count: pixelCount
      };
    });
    return {
      classes, total_pixels: grandTotal, periods_counted: analyticsData.length,
      range_label: analyticsData.length === 1 ? analyticsData[0].label : `${analyticsData[0].label} — ${analyticsData[analyticsData.length - 1].label}`
    };
  }, [analyticsData]);

  const changeDetection = useMemo(() => {
    if (!analyticsData || analyticsData.length < 2) return null;
    const first = analyticsData[0];
    const last = analyticsData[analyticsData.length - 1];
    const allClasses = new Set([...Object.keys(first.classes), ...Object.keys(last.classes)]);
    const changes = {};
    allClasses.forEach(cls => {
      const startPct = first.classes[cls]?.percentage || 0;
      const endPct = last.classes[cls]?.percentage || 0;
      changes[cls] = { start: startPct, end: endPct, diff: (endPct - startPct).toFixed(2) };
    });
    return changes;
  }, [analyticsData]);

  // ── Helpers ──
  const buildPayload = () => {
    const coordinates = [drawnPolygon.map(p => [p.lng, p.lat])];
    coordinates[0].push(coordinates[0][0]);
    return {
      geometry: { type: "Polygon", coordinates },
      start_year: parseInt(startYear),
      end_year: parseInt(endYear)
    };
  };

  const handleClearFilters = () => {
    setStartYear('2022'); setEndYear('2023'); setSelectedSeason('all');
    setSarOpacity(0.8); setDrawnPolygon(null);
    setAnalyticsData(null); setAnalysisError(null);
    setCropData(null); setCropError(null);
    setCropAreaData(null); setCropAreaError(null);
  };

  // ── Run LULC Analysis ──
  const handleRunLULC = async () => {
    if (!drawnPolygon) { alert("Please draw your study area first."); return; }
    setIsAnalyzing(true); setAnalysisError(null); setAnalyticsData(null);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/analytics/lulc-change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      });
      const data = await response.json();
      if (data.status === 'success' && data.analytics?.length > 0) {
        let filtered = data.analytics;
        if (selectedSeason === 'Jan-Jun') filtered = filtered.filter(d => d.period === 'Jan-Jun');
        else if (selectedSeason === 'Jul-Dec') filtered = filtered.filter(d => d.period === 'Jul-Dec');
        if (filtered.length === 0) setAnalysisError(`No data for selected season. Available: ${data.analytics.map(a => a.label).join(', ')}`);
        else setAnalyticsData(filtered);
      } else {
        setAnalysisError(data.message || "No LULC data available for this area and time range.");
      }
    } catch (error) {
      setAnalysisError("Could not connect to the backend. Is FastAPI running on port 8000?");
    }
    setIsAnalyzing(false);
  };

  // ── Run Crop Intensity + Crop Area Coverage (parallel) ──
  const handleRunCropIntensity = async () => {
    if (!drawnPolygon) { alert("Please draw your study area first."); return; }
    setIsCropAnalyzing(true);
    setCropError(null); setCropData(null);
    setCropAreaError(null); setCropAreaData(null);

    const payload = buildPayload();

    try {
      const [intensityResult, areaResult] = await Promise.allSettled([
        fetch('http://127.0.0.1:8000/api/v1/analytics/crop-intensity', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json()),
        fetch('http://127.0.0.1:8000/api/v1/analytics/crop-area', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json())
      ]);

      if (intensityResult.status === 'fulfilled') {
        const d = intensityResult.value;
        if (d.status === 'success') setCropData(d);
        else if (d.status === 'no_cropland') setCropError(d.message);
        else setCropError(d.message || d.detail || "Crop intensity analysis failed.");
      } else {
        setCropError("Could not connect to the backend. Is FastAPI running on port 8000?");
      }

      if (areaResult.status === 'fulfilled') {
        const d = areaResult.value;
        if (d.yearly_data) setCropAreaData(d);
        else setCropAreaError(d.detail || "Crop area analysis failed.");
      }
    } catch (error) {
      setCropError("Could not connect to the backend. Is FastAPI running on port 8000?");
    }
    setIsCropAnalyzing(false);
  };

  const handleRunAnalysis = () => {
    if (activeTab === 'lulc') handleRunLULC();
    else handleRunCropIntensity();
  };

  return (
    <div className="w-full h-full relative z-0 bg-white p-4 lg:p-8 space-y-4 lg:space-y-6 overflow-y-auto">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-100 pb-4 lg:pb-6 gap-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-zinc-900 leading-tight">Analysis Dashboard</h2>
          <p className="text-xs lg:text-sm text-zinc-500 mt-1">Draw a study area and analyze land use or crop activity</p>
        </div>
        <button onClick={() => { if (analyticsData || cropData) window.print(); }} disabled={!analyticsData && !cropData} className="flex items-center gap-1.5 lg:gap-2 text-white font-bold text-xs lg:text-sm bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg hover:opacity-90 transition shadow-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
          <svg className="w-3 h-3 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export Report
        </button>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-1.5 p-1.5 bg-zinc-50 rounded-xl border border-zinc-100 w-fit">
        <button onClick={() => setActiveTab('lulc')} className={`text-xs lg:text-sm font-bold px-4 py-2 rounded-lg transition ${activeTab === 'lulc' ? 'bg-white text-[#1d5e3a] shadow border border-green-100' : 'text-zinc-500 hover:text-[#1d5e3a]'}`}>
          LULC Change
        </button>
        <button onClick={() => setActiveTab('crop')} className={`text-xs lg:text-sm font-bold px-4 py-2 rounded-lg transition ${activeTab === 'crop' ? 'bg-white text-[#1d5e3a] shadow border border-green-100' : 'text-zinc-500 hover:text-[#1d5e3a]'}`}>
          Crop Intensity
        </button>
      </div>

      {/* ── Control Row ── */}
      <div className="flex flex-wrap lg:flex-nowrap items-stretch justify-start gap-2 lg:gap-4">
        <div className="flex items-center gap-2 lg:gap-3 bg-zinc-50 p-1.5 lg:p-2 rounded-xl border border-zinc-100 flex-shrink-0">
          <span className="text-[9px] lg:text-[11px] font-bold text-[#23432f] uppercase tracking-wider ml-1 lg:ml-2">Range</span>
          <div className="flex items-center gap-1 lg:gap-2">
            <select value={startYear} onChange={(e) => setStartYear(e.target.value)} className="text-xs lg:text-sm font-bold text-zinc-800 bg-white px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg border border-zinc-200 outline-none cursor-pointer">
              {[2021, 2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-zinc-400 font-bold text-xs">—</span>
            <select value={endYear} onChange={(e) => setEndYear(e.target.value)} className="text-xs lg:text-sm font-bold text-zinc-800 bg-white px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg border border-zinc-200 outline-none cursor-pointer">
              {[2021, 2022, 2023, 2024, 2025].filter(y => y >= parseInt(startYear)).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {activeTab === 'lulc' && (
          <div className="flex items-center gap-2 lg:gap-4 bg-zinc-50 p-1.5 lg:p-2 rounded-xl border border-zinc-100 px-3 lg:px-4 flex-shrink-0">
            <span className="text-[9px] lg:text-[11px] font-bold text-[#23432f] uppercase tracking-wider">Season</span>
            <div className="flex items-center gap-3 lg:gap-4">
              {[{ value: 'all', label: 'All' }, { value: 'Jan-Jun', label: 'Dry' }, { value: 'Jul-Dec', label: 'Wet' }].map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm font-bold text-zinc-700 cursor-pointer hover:text-[#1d5e3a] transition whitespace-nowrap">
                  <input type="radio" name="analysisSeason" value={opt.value} checked={selectedSeason === opt.value} onChange={(e) => setSelectedSeason(e.target.value)} className="w-3 h-3 lg:w-4 lg:h-4 accent-[#1d5e3a] cursor-pointer" /> {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 lg:gap-3 ml-auto">
          <button onClick={handleClearFilters} className="text-[10px] lg:text-xs font-bold text-[#23432f] bg-white border border-[#23432f] px-2 py-1 lg:px-4 lg:py-2 rounded-lg hover:bg-zinc-100 transition whitespace-nowrap">Clear</button>
          <button onClick={handleRunAnalysis} disabled={isAnalyzing || isCropAnalyzing} className="text-[10px] lg:text-xs font-bold text-white bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-3 py-1 lg:px-5 lg:py-2 rounded-lg hover:opacity-90 transition shadow-sm whitespace-nowrap disabled:opacity-60 flex items-center gap-2">
            {(isAnalyzing || isCropAnalyzing) && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            {(isAnalyzing || isCropAnalyzing) ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* ── Main Grid: Map + Results ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-4 lg:gap-6">
        {/* Left: Mini Map */}
        <div className="space-y-3">
          <CalabarzonMiniMap sarUrl={sarUrl} basemapUrl={basemapUrl} sarOpacity={sarOpacity} setSarOpacity={setSarOpacity} drawnPolygon={drawnPolygon} setDrawnPolygon={setDrawnPolygon} />
          {drawnPolygon ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span className="text-xs lg:text-sm text-green-800 font-medium">Study area defined ({drawnPolygon.length} vertices). Click <strong>Run Analysis</strong>.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-xs lg:text-sm text-amber-800 font-medium">Click the <strong>pen icon</strong> on the map to draw your study area.</span>
            </div>
          )}
        </div>

        {/* Right: Results Panel */}
        <div className="space-y-4 lg:space-y-6">

          {/* ════════ LULC TAB ════════ */}
          {activeTab === 'lulc' && (
            <>
              {!analyticsData && !isAnalyzing && !analysisError && <EmptyState message="No LULC results yet" sub="Draw a study area and click Run Analysis" />}
              {isAnalyzing && <LoadingState message="Processing LULC data in Google Earth Engine..." />}
              {analysisError && <ErrorState message={analysisError} />}
              {overallSummary && (
                <div className="border-2 border-[#1d5e3a]/20 rounded-xl p-4 lg:p-6 bg-gradient-to-br from-[#f0fdf4] to-white space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm lg:text-base font-black text-[#1d5e3a] uppercase tracking-wide">Overall Land Cover Distribution</h3>
                      <p className="text-[10px] lg:text-xs text-zinc-500 mt-1">Aggregated across <strong>{overallSummary.periods_counted} period{overallSummary.periods_counted > 1 ? 's' : ''}</strong> &middot; {overallSummary.range_label}</p>
                    </div>
                    <span className="text-[10px] lg:text-xs text-zinc-400 font-mono bg-white px-2 py-1 rounded-lg border border-zinc-100">{overallSummary.total_pixels.toLocaleString()} total px</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
                    {CLASS_ORDER.map(cls => {
                      const data = overallSummary.classes[cls];
                      if (!data) return null;
                      return (
                        <div key={cls} className="bg-white border border-zinc-200 rounded-xl p-3 lg:p-4 space-y-1 shadow-sm">
                          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-sm" style={{ backgroundColor: CLASS_COLORS[cls] }}></div><span className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase">{cls}</span></div>
                          <p className="text-xl lg:text-3xl font-black text-zinc-900">{data.percentage}%</p>
                          <p className="text-[9px] lg:text-[10px] text-zinc-400 font-mono">{data.pixel_count.toLocaleString()} px</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-2.5 pt-2">
                    {CLASS_ORDER.filter(cls => overallSummary.classes[cls]).sort((a, b) => (overallSummary.classes[b]?.percentage || 0) - (overallSummary.classes[a]?.percentage || 0)).map(cls => (
                      <ClassBar key={cls} label={cls} percentage={overallSummary.classes[cls].percentage} color={CLASS_COLORS[cls]} pixelCount={overallSummary.classes[cls].pixel_count} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════════ CROP INTENSITY TAB ════════ */}
          {activeTab === 'crop' && (
            <>
              {!cropData && !isCropAnalyzing && !cropError && <EmptyState message="No crop intensity results yet" sub="Draw a study area and click Run Analysis" />}
              {isCropAnalyzing && <LoadingState message="Analyzing SAR & NDVI timelines for crop cycles..." />}
              {cropError && <ErrorState message={cropError} />}

              {/* Crop Summary Cards */}
              {cropData?.summary && (
                <div className="border-2 border-amber-200/50 rounded-xl p-4 lg:p-6 bg-gradient-to-br from-amber-50/50 to-white space-y-4">
                  <div>
                    <h3 className="text-sm lg:text-base font-black text-amber-800 uppercase tracking-wide flex items-center gap-2">
                      <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                      Crop Intensity Summary
                    </h3>
                    <p className="text-[10px] lg:text-xs text-zinc-500 mt-1">
                      {cropData.summary.total_years_analyzed} year{cropData.summary.total_years_analyzed > 1 ? 's' : ''} analyzed &middot; Elevation: {cropData.summary.elevation_m}m
                    </p>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
                    <div className="bg-white border border-zinc-200 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase">Avg Cycles/Year</p>
                      <p className="text-xl lg:text-3xl font-black text-zinc-900 mt-1">{cropData.summary.average_cycles_per_year}</p>
                    </div>
                    <div className="bg-white border border-zinc-200 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase">Avg Utilization</p>
                      <p className="text-xl lg:text-3xl font-black text-zinc-900 mt-1">{cropData.summary.average_utilization_percent}%</p>
                    </div>
                    <div className="bg-white border border-zinc-200 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase">Avg NDVI</p>
                      <p className="text-xl lg:text-3xl font-black text-zinc-900 mt-1">{cropData.summary.average_ndvi}</p>
                    </div>
                    <div className="bg-white border border-zinc-200 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase">Dominant Crop</p>
                      <p className="text-base lg:text-xl font-black text-[#1d5e3a] mt-1 leading-tight">{cropData.summary.dominant_crop}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Crop Area Coverage Bar Chart */}
              {cropAreaData?.yearly_data?.length > 0 && (() => {
                const yearly = cropAreaData.yearly_data;
                const avg = cropAreaData.overall_avg_percentage;
                const first = yearly[0].crop_percentage;
                const last = yearly[yearly.length - 1].crop_percentage;
                const diff = (last - first).toFixed(1);
                return (
                  <div className="border border-zinc-200 rounded-xl p-4 lg:p-5 bg-white space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-xs lg:text-sm font-black text-zinc-800 uppercase tracking-wide flex items-center gap-2">
                          <svg className="w-4 h-4 text-[#2d6a4f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                          Crop Area Coverage
                        </h4>
                        <p className="text-[10px] lg:text-xs text-zinc-400 mt-0.5">Agriculture pixels present in both semesters</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-[9px] text-zinc-400 uppercase font-bold">Avg</p>
                          <p className="text-sm font-black text-zinc-900">{avg}%</p>
                        </div>
                        <div className={`rounded-lg px-3 py-1.5 text-center ${parseFloat(diff) >= 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                          <p className="text-[9px] text-zinc-400 uppercase font-bold">Trend</p>
                          <p className={`text-sm font-black ${parseFloat(diff) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {parseFloat(diff) >= 0 ? '+' : ''}{diff}%
                          </p>
                        </div>
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={yearly} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                        <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#71717a' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#71717a' }} tickFormatter={v => `${v}%`} />
                        <RechartsTooltip content={<CropAreaTooltip />} />
                        <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="5 5"
                          label={{ value: `Avg ${avg}%`, position: 'right', fill: '#f59e0b', fontSize: 10 }} />
                        <Bar dataKey="crop_percentage" maxBarSize={56} shape={<CropAreaBar />} />
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-100">
                            <th className="text-left py-2 px-3 font-bold text-zinc-500">Year</th>
                            <th className="text-right py-2 px-3 font-bold text-zinc-500">Coverage</th>
                            <th className="text-right py-2 px-3 font-bold text-zinc-500">Crop Area (ha)</th>
                            <th className="text-right py-2 px-3 font-bold text-zinc-500">Total Area (ha)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yearly.map(row => (
                            <tr key={row.year} className="border-b border-zinc-50 hover:bg-zinc-50 transition">
                              <td className="py-2 px-3 font-black text-zinc-900">{row.year}</td>
                              <td className="py-2 px-3 text-right font-mono text-zinc-700">{row.crop_percentage}%</td>
                              <td className="py-2 px-3 text-right font-mono text-zinc-700">{row.crop_area_ha}</td>
                              <td className="py-2 px-3 text-right font-mono text-zinc-700">{row.total_area_ha}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {cropAreaError && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Crop area data unavailable: {cropAreaError}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          BELOW THE GRID: LULC sections
         ═══════════════════════════════════════════ */}
      {activeTab === 'lulc' && changeDetection && (
        <div className="border border-zinc-200 rounded-xl p-4 lg:p-6 bg-zinc-50">
          <h4 className="text-xs lg:text-sm font-black text-zinc-800 uppercase tracking-wide mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            Change Detection: {analyticsData[0].label} → {analyticsData[analyticsData.length - 1].label}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs lg:text-sm">
              <thead><tr className="border-b border-zinc-200 bg-white"><th className="text-left py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500">Land Use Class</th><th className="text-right py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500">{analyticsData[0].label}</th><th className="text-right py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500">{analyticsData[analyticsData.length - 1].label}</th><th className="text-right py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500">Change</th><th className="text-left py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500">Trend</th></tr></thead>
              <tbody>
                {Object.entries(changeDetection).sort((a, b) => Math.abs(b[1].diff) - Math.abs(a[1].diff)).map(([className, data]) => {
                  const diffNum = parseFloat(data.diff);
                  return (
                    <tr key={className} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-100/50 transition">
                      <td className="py-2 lg:py-3 px-2 lg:px-4"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[className] || '#888' }}></div><span className="font-bold text-zinc-800">{className}</span></div></td>
                      <td className="text-right py-2 lg:py-3 px-2 lg:px-4 font-mono text-zinc-700">{data.start.toFixed(2)}%</td>
                      <td className="text-right py-2 lg:py-3 px-2 lg:px-4 font-mono text-zinc-700">{data.end.toFixed(2)}%</td>
                      <td className="text-right py-2 lg:py-3 px-2 lg:px-4"><span className={`font-black font-mono ${diffNum > 0 ? 'text-green-600' : diffNum < 0 ? 'text-red-600' : 'text-zinc-400'}`}>{diffNum > 0 ? '+' : ''}{data.diff}%</span></td>
                      <td className="py-2 lg:py-3 px-2 lg:px-4">
                        {diffNum > 0 && <span className="text-[10px] lg:text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">▲ Increase</span>}
                        {diffNum < 0 && <span className="text-[10px] lg:text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">▼ Decrease</span>}
                        {diffNum === 0 && <span className="text-[10px] lg:text-xs bg-zinc-100 text-zinc-500 font-bold px-2 py-0.5 rounded-full">— Stable</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'lulc' && analyticsData && analyticsData.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs lg:text-sm font-black text-zinc-800 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Per-Period Breakdown
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            {analyticsData.map((entry, idx) => {
              const prev = idx > 0 ? analyticsData[idx - 1] : null;
              return (
                <div key={idx} className="border border-zinc-200 rounded-xl p-4 lg:p-5 bg-zinc-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs lg:text-sm font-black text-zinc-800 uppercase tracking-wide">{entry.label}</h5>
                    <span className="text-[10px] lg:text-xs text-zinc-400 font-mono">{entry.total_pixels?.toLocaleString()} px</span>
                  </div>
                  <div className="space-y-2.5">
                    {Object.entries(entry.classes).sort((a, b) => b[1].percentage - a[1].percentage).map(([className, data]) => (
                      <div key={className} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[className] || '#888' }}></div><span className="text-xs lg:text-sm font-bold text-zinc-800">{className}</span></div>
                          <div className="flex items-center gap-2"><ChangeIndicator current={data.percentage} previous={prev?.classes[className]?.percentage ?? null} /><span className="text-xs lg:text-sm font-black text-zinc-900 w-14 text-right">{data.percentage}%</span></div>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${data.percentage}%`, backgroundColor: CLASS_COLORS[className] || '#888' }}></div></div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          BELOW THE GRID: CROP INTENSITY yearly cards
         ═══════════════════════════════════════════ */}
      {activeTab === 'crop' && cropData?.yearly && cropData.yearly.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-xs lg:text-sm font-black text-zinc-800 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Year-by-Year Crop Analysis
          </h4>

          {cropData.yearly.map((yr, idx) => {
            const intensityStyle = INTENSITY_COLORS[yr.intensity_label] || INTENSITY_COLORS['Fallow / Inactive'];
            // Mark peak months in NDVI timeline
            const ndviWithPeaks = yr.ndvi_timeline.map(d => ({
              ...d,
              isPeak: yr.peak_months.includes(d.month)
            }));

            return (
              <div key={idx} className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50">
                {/* Year Header */}
                <div className="flex items-center justify-between p-4 lg:p-5 border-b border-zinc-200 bg-white">
                  <div className="flex items-center gap-3">
                    <h5 className="text-base lg:text-lg font-black text-zinc-900">{yr.year}</h5>
                    <span className={`text-[10px] lg:text-xs font-bold px-2.5 py-1 rounded-full border ${intensityStyle.bg} ${intensityStyle.text} ${intensityStyle.border}`}>
                      {yr.intensity_label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 lg:gap-6 text-[10px] lg:text-xs text-zinc-500">
                    <span><strong className="text-zinc-800">{yr.cropping_cycles}</strong> cycle{yr.cropping_cycles !== 1 ? 's' : ''}</span>
                    <span><strong className="text-zinc-800">{yr.utilization_percent}%</strong> utilized</span>
                    <span><strong className="text-zinc-800">{yr.active_months}</strong> active / <strong>{yr.fallow_months}</strong> fallow</span>
                  </div>
                </div>

                <div className="p-4 lg:p-5 space-y-5">
                  {/* Timelines */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                    <div className="bg-white border border-zinc-100 rounded-lg p-3 lg:p-4">
                      <TimelineChart data={ndviWithPeaks} dataKey="ndvi_mean" color="#15803d" label="NDVI Timeline" unit="Vegetation Index" minVal={0} maxVal={1} />
                      {yr.peak_months.length > 0 && (
                        <p className="text-[9px] lg:text-[10px] text-zinc-400 mt-2">
                          Peak months: <strong className="text-zinc-600">{yr.peak_months.map(m => MONTH_LABELS[m - 1]).join(', ')}</strong>
                          <span className="inline-block w-2 h-2 bg-amber-400 rounded-full ml-1.5 align-middle ring-1 ring-offset-1 ring-amber-400"></span>
                        </p>
                      )}
                    </div>
                    <div className="bg-white border border-zinc-100 rounded-lg p-3 lg:p-4">
                      <TimelineChart data={yr.sar_timeline} dataKey="vh_mean" color="#1d4ed8" label="SAR VH Backscatter" unit="dB" minVal={-25} maxVal={-5} />
                    </div>
                  </div>

                  {/* Estimated Crops */}
                  <div>
                    <p className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Estimated Crop Types</p>
                    <div className="space-y-2">
                      {yr.estimated_crops.map((crop, ci) => (
                        <div key={ci} className="flex items-start gap-3 bg-white border border-zinc-100 rounded-lg p-3 lg:p-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs lg:text-sm font-black text-zinc-800">{crop.crop}</span>
                              <span className={`text-[9px] lg:text-[10px] font-bold px-2 py-0.5 rounded-full ${CONFIDENCE_COLORS[crop.confidence]}`}>
                                {crop.confidence}
                              </span>
                            </div>
                            <p className="text-[10px] lg:text-xs text-zinc-500 leading-relaxed">{crop.reasoning}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Stats Row */}
                  <div className="flex items-center gap-4 lg:gap-6 text-[10px] lg:text-xs text-zinc-500 pt-2 border-t border-zinc-100">
                    <span>Max NDVI: <strong className="text-zinc-800">{yr.max_ndvi}</strong></span>
                    <span>Mean NDVI: <strong className="text-zinc-800">{yr.mean_ndvi}</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}