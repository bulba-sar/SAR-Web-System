import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { MapContainer, TileLayer, useMap, useMapEvents, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

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

const MapControls = ({ bounds }) => {
  const map = useMap();
  return (
    <div className="absolute top-3 right-3 lg:top-4 lg:right-4 z-[1000] flex flex-col shadow-lg rounded-lg overflow-hidden border border-white/10">
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
  const [vertexCount, setVertexCount] = useState(0);
  const mapRef = useRef(null);
  // All native Leaflet draw layers live here — no React state, avoids stale closures
  const drawRef = useRef({ points: [], vertices: [], poly: null, preview: null });

  const cleanupLayers = useCallback((map) => {
    const d = drawRef.current;
    d.vertices.forEach(v => map.hasLayer(v) && map.removeLayer(v));
    if (d.poly && map.hasLayer(d.poly)) map.removeLayer(d.poly);
    if (d.preview && map.hasLayer(d.preview)) map.removeLayer(d.preview);
    drawRef.current = { points: [], vertices: [], poly: null, preview: null };
  }, []);

  const finishDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = drawRef.current.points;
    if (pts.length >= 3) {
      setDrawnPolygon([...pts]);
    } else if (pts.length > 0) {
      alert('Please add at least 3 points to close the polygon.');
    }
    cleanupLayers(map);
    setVertexCount(0);
    setIsDrawing(false);
  }, [setDrawnPolygon, cleanupLayers]);

  const cancelDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    cleanupLayers(map);
    setVertexCount(0);
    setIsDrawing(false);
  }, [cleanupLayers]);

  // Start a fresh drawing session
  const startDrawing = () => {
    const map = mapRef.current;
    if (!map) return;
    cleanupLayers(map);
    setVertexCount(0);
    setIsDrawing(true);
  };

  // Undo the last placed vertex
  const undoVertex = () => {
    const map = mapRef.current;
    if (!map) return;
    const d = drawRef.current;
    if (d.points.length === 0) return;
    d.points.pop();
    const lastMarker = d.vertices.pop();
    if (lastMarker && map.hasLayer(lastMarker)) map.removeLayer(lastMarker);
    if (d.poly && map.hasLayer(d.poly)) map.removeLayer(d.poly);
    d.poly = d.points.length >= 2
      ? L.polygon(d.points, { color: '#1d5e3a', weight: 2, dashArray: '6 4', fillColor: '#1d5e3a', fillOpacity: 0.15 }).addTo(map)
      : null;
    setVertexCount(d.points.length);
  };

  // When the parent clears drawnPolygon (e.g. Clear button), also wipe Leaflet draw layers
  useEffect(() => {
    if (drawnPolygon === null) {
      const map = mapRef.current;
      if (map) cleanupLayers(map);
      setVertexCount(0);
      setIsDrawing(false);
    }
  }, [drawnPolygon, cleanupLayers]);

  // Register / unregister native Leaflet events while drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isDrawing) return;

    const d = drawRef.current;

    const onMapClick = (e) => {
      d.points.push(e.latlng);

      // Vertex dot
      const marker = L.circleMarker(e.latlng, {
        radius: 5, color: '#fff', fillColor: '#1d5e3a', fillOpacity: 1, weight: 2,
      }).addTo(map);
      d.vertices.push(marker);

      // Live polygon outline
      if (d.poly && map.hasLayer(d.poly)) map.removeLayer(d.poly);
      if (d.points.length >= 2) {
        d.poly = L.polygon(d.points, {
          color: '#1d5e3a', weight: 2, dashArray: '6 4', fillColor: '#1d5e3a', fillOpacity: 0.15,
        }).addTo(map);
      }

      setVertexCount(d.points.length);
    };

    const onDblClick = () => {
      // Leaflet fires two click events before dblclick — remove the duplicate
      if (d.points.length > 0) d.points.pop();
      const lastMarker = d.vertices.pop();
      if (lastMarker && map.hasLayer(lastMarker)) map.removeLayer(lastMarker);
      setVertexCount(d.points.length);
      finishDrawing();
    };

    const onMouseMove = (e) => {
      if (d.points.length === 0) return;
      if (d.preview && map.hasLayer(d.preview)) map.removeLayer(d.preview);
      d.preview = L.polyline([d.points[d.points.length - 1], e.latlng], {
        color: '#1d5e3a', weight: 1.5, dashArray: '4 4', opacity: 0.5,
      }).addTo(map);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cancelDrawing();
      if (e.key === 'Enter') finishDrawing();
    };

    map.on('click', onMapClick);
    map.on('dblclick', onDblClick);
    map.on('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    map.getContainer().style.cursor = 'crosshair';

    return () => {
      map.off('click', onMapClick);
      map.off('dblclick', onDblClick);
      map.off('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      map.getContainer().style.cursor = '';
      // Clean up the preview line on mode exit (vertex dots + poly stay until cleared/finish)
      if (d.preview && map.hasLayer(d.preview)) map.removeLayer(d.preview);
      d.preview = null;
    };
  }, [isDrawing, finishDrawing, cancelDrawing]);

  return (
    <div className="space-y-1.5">

      {/* ── GEE-style toolbar ── */}
      <div className="flex items-center justify-between bg-green-50 dark:bg-zinc-800 border border-green-200 dark:border-zinc-700 rounded-lg px-3 py-2 gap-2">
        <div className="flex items-center gap-2">
          {/* Draw / Drawing button */}
          <button
            onClick={isDrawing ? cancelDrawing : startDrawing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              isDrawing ? 'bg-gradient-to-r from-[#23432f] to-[#1d5e3a] text-white opacity-80' : 'bg-gradient-to-r from-[#23432f] to-[#1d5e3a] text-white hover:opacity-90'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {isDrawing ? 'Drawing…' : 'Draw Polygon'}
          </button>

          {/* Undo */}
          {isDrawing && vertexCount > 0 && (
            <button onClick={undoVertex} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-green-100 dark:bg-zinc-700 hover:bg-green-200 dark:hover:bg-zinc-600 text-green-800 dark:text-zinc-200 text-xs font-bold transition-all">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Undo
            </button>
          )}

          {/* Vertex count */}
          {isDrawing && (
            <span className="text-[10px] font-mono text-green-700 dark:text-green-400">{vertexCount} pts</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Finish — shown when ≥3 vertices placed */}
          {isDrawing && vertexCount >= 3 && (
            <button onClick={finishDrawing} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-700 hover:bg-green-600 text-white text-xs font-bold transition-all">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Finish
            </button>
          )}

        </div>
      </div>

      {/* ── Map ── */}
      <div className="relative w-full h-[285px] lg:h-[400px] bg-black border border-zinc-200 rounded-xl overflow-hidden shadow-inner">
        {isDrawing && (
          <div className="absolute top-0 left-0 w-full bg-zinc-900/90 text-white text-[10px] font-semibold text-center py-1.5 z-[2000] backdrop-blur-sm">
            Click to add points &nbsp;·&nbsp; Double-click or <kbd className="bg-zinc-700 px-1 rounded text-[9px]">Enter</kbd> to finish &nbsp;·&nbsp; <kbd className="bg-zinc-700 px-1 rounded text-[9px]">ESC</kbd> to cancel
          </div>
        )}

        <MapContainer
          bounds={calabarzonBounds}
          scrollWheelZoom={true}
          doubleClickZoom={false}
          className="h-full w-full z-0"
          zoomControl={false}
          style={{ backgroundColor: '#000000' }}
          ref={mapRef}
        >
          {basemapUrl && <TileLayer key={basemapUrl} url={basemapUrl} attribution="&copy; GEE" updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />}
          {sarUrl && <TileLayer key={sarUrl + sarOpacity} url={sarUrl} opacity={sarOpacity} attribution="SAR Data" updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />}
          {drawnPolygon && !isDrawing && (
            <Polygon positions={drawnPolygon} pathOptions={{ color: '#1d5e3a', fillColor: '#1d5e3a', fillOpacity: 0.25, weight: 2.5 }} />
          )}
          <MapControls bounds={calabarzonBounds} />
        </MapContainer>

        {/* Opacity control */}
        <div className="absolute bottom-3 left-3 lg:bottom-4 lg:left-4 z-[1000] bg-zinc-900/80 backdrop-blur-sm p-2 lg:p-3 rounded-lg border border-white/10 flex items-center gap-3 shadow-xl">
          <span className="text-[9px] lg:text-[10px] font-bold text-white uppercase tracking-wider">Opacity</span>
          <input type="range" min="0" max="1" step="0.1" value={sarOpacity} onChange={(e) => setSarOpacity(parseFloat(e.target.value))} className="w-20 lg:w-28 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#1d5e3a]" />
          <span className="text-[10px] lg:text-xs font-black font-mono text-white w-8">{Math.round(sarOpacity * 100)}%</span>
        </div>

        {/* Class legend */}
        <div className="absolute bottom-3 right-3 lg:bottom-4 lg:right-4 z-[1000] bg-zinc-900/80 backdrop-blur-sm p-2 lg:p-3 rounded-lg shadow-sm text-[9px] lg:text-[10px] font-bold space-y-1 lg:space-y-1.5 border border-white/10">
          {Object.entries(CLASS_COLORS).map(([cls, color]) => (
            <div key={cls} className="flex items-center gap-2">
              <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-sm" style={{ backgroundColor: color }}></div>
              <span className="text-white">{cls}</span>
            </div>
          ))}
        </div>
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
        <span className="text-xs lg:text-sm font-bold text-zinc-800 dark:text-zinc-200">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] lg:text-xs text-zinc-400 font-mono">{pixelCount?.toLocaleString() || 0} px</span>
        <span className="text-xs lg:text-sm font-black text-zinc-900 dark:text-zinc-100 w-14 text-right">{percentage}%</span>
      </div>
    </div>
    <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
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
  <div className="flex flex-col items-center justify-center h-[300px] lg:h-[418px] border border-dashed border-zinc-200 dark:border-zinc-600 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center px-6">
    <svg className="w-12 h-12 lg:w-16 lg:h-16 text-zinc-300 dark:text-zinc-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    <p className="text-sm lg:text-base font-bold text-zinc-400 dark:text-zinc-500">{message}</p>
    {sub && <p className="text-xs lg:text-sm text-zinc-400 dark:text-zinc-500 mt-1">{sub}</p>}
  </div>
);

const LoadingState = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-[300px] lg:h-[418px] border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800">
    <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
    <p className="text-sm font-bold text-zinc-600 dark:text-zinc-300">{message}</p>
    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">This may take 30-60 seconds depending on area size and year range</p>
  </div>
);

const ErrorState = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-[300px] lg:h-[418px] border border-red-200 dark:border-red-900 rounded-xl bg-red-50 dark:bg-red-950/30 text-center px-6">
    <svg className="w-10 h-10 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l4 4m0-4l-4 4" />
    </svg>
    <p className="text-sm font-bold text-red-700 dark:text-red-400">No Result Found</p>
    <p className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-sm">{message}</p>
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
//  COMPARE VIEW — side-by-side LULC maps
// ============================================================

const COMPARE_PERIODS = ['Jan-Jun', 'Jul-Dec'];
const COMPARE_CLASSES = [
  { value: 'all',         label: 'All Classes' },
  { value: 'urban',       label: 'Urban',        color: '#dc2626' },
  { value: 'forest',      label: 'Forest',       color: '#15803d' },
  { value: 'agriculture', label: 'Agriculture',  color: '#ca8a04' },
];

// Stores the Leaflet map instance in a ref so siblings can read it
function CaptureMap({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; return () => { mapRef.current = null; }; }, [map, mapRef]);
  return null;
}

// Syncs pan/zoom to the other map when this map moves
function SyncMapView({ otherRef, lockRef }) {
  const map = useMap();
  useMapEvents({
    moveend: () => {
      if (lockRef.current || !otherRef.current) return;
      lockRef.current = true;
      otherRef.current.setView(map.getCenter(), map.getZoom(), { animate: false });
      requestAnimationFrame(() => { lockRef.current = false; });
    },
  });
  return null;
}

const compareBounds = [[13.1, 119.5], [15.1, 122.8]];

function ComparePanel({ label, accentClass, year, setYear, period, setPeriod, tileUrl, basemapUrl, opacity, loading, mapRef, otherRef, lockRef, years }) {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-zinc-200 shadow-sm">
      {/* Selector bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-black">
        <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${accentClass}`}>{label}</span>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="bg-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-lg border border-zinc-600 outline-none cursor-pointer"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="bg-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-lg border border-zinc-600 outline-none cursor-pointer"
        >
          {COMPARE_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {loading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin ml-auto" />}
      </div>

      {/* Map */}
      <div className="relative h-[340px] lg:h-[420px] bg-black">
        <MapContainer
          bounds={compareBounds}
          scrollWheelZoom
          zoomControl={false}
          doubleClickZoom={false}
          className="h-full w-full"
          style={{ backgroundColor: '#000000' }}
        >
          <CaptureMap mapRef={mapRef} />
          <SyncMapView otherRef={otherRef} lockRef={lockRef} />
          {/* Calabarzon-clipped satellite basemap (same as main filter map) */}
          {basemapUrl
            ? <TileLayer key={basemapUrl} url={basemapUrl} attribution="&copy; Copernicus / GEE" updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />
            : <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; CartoDB" />
          }
          {tileUrl && <TileLayer key={tileUrl + opacity} url={tileUrl} attribution="GEE LULC" opacity={opacity} updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />}
          <MapControls bounds={compareBounds} />
        </MapContainer>

        {/* Period badge */}
        <div className="absolute bottom-2 left-2 z-[1000] bg-zinc-900/80 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-1 rounded-md pointer-events-none">
          {year} · {period}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
//  SLIDER COMPARE – one map with a draggable before/after divider
// ────────────────────────────────────────────────────────────────

// Manages both LULC tile layers imperatively (so we own the refs) and applies
// CSS rect() clipping — the same technique as the official leaflet-side-by-side plugin.
function SliderLayers({ leftUrl, rightUrl, opacity, sliderPct }) {
  const map = useMap();
  const leftRef  = useRef(null);
  const rightRef = useRef(null);

  // Left layer — set ref BEFORE addTo so layeradd fires after ref is ready
  useEffect(() => {
    const layer = L.tileLayer(leftUrl ?? '', {
      opacity, maxNativeZoom: 15, maxZoom: 18,
      keepBuffer: 4, updateWhenZooming: false,
    });
    leftRef.current = layer;           // ref first
    if (leftUrl) layer.addTo(map);     // addTo fires layeradd; ref already set
    return () => { layer.remove(); leftRef.current = null; };
  }, [leftUrl, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Right layer — same pattern
  useEffect(() => {
    const layer = L.tileLayer(rightUrl ?? '', {
      opacity, maxNativeZoom: 15, maxZoom: 18,
      keepBuffer: 4, updateWhenZooming: false,
    });
    rightRef.current = layer;
    if (rightUrl) layer.addTo(map);
    return () => { layer.remove(); rightRef.current = null; };
  }, [rightUrl, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync opacity separately so it doesn't recreate the layers
  useEffect(() => {
    leftRef.current?.setOpacity(opacity);
    rightRef.current?.setOpacity(opacity);
  }, [opacity]);

  // Apply clip — convert divider from viewport px to layer coordinates so the
  // clip stays correct while Leaflet pans (same technique as leaflet-side-by-side).
  useEffect(() => {
    const update = () => {
      const size = map.getSize();
      const divX = Math.round(size.x * sliderPct / 100);
      const nw   = map.containerPointToLayerPoint([0, 0]);
      const se   = map.containerPointToLayerPoint([size.x, size.y]);
      const clipX = nw.x + divX;   // divider in layer coordinate space

      const lc = leftRef.current?.getContainer?.();
      const rc = rightRef.current?.getContainer?.();
      if (lc) lc.style.clip = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`;
      if (rc) rc.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`;
    };
    update();
    map.on('move zoom resize layeradd', update);
    return () => map.off('move zoom resize layeradd', update);
  }, [sliderPct, map]);

  return null;
}

function SliderCompare({ leftYear, setLeftYear, leftPeriod, setLeftPeriod,
                         rightYear, setRightYear, rightPeriod, setRightPeriod,
                         leftTile, rightTile, basemapUrl, opacity,
                         leftLoading, rightLoading, years }) {
  const [sliderPct, setSliderPct] = useState(50);
  const containerRef = useRef(null);
  const isDragging   = useRef(false);

  const startDrag = (e) => {
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct  = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    setSliderPct(pct);
  };
  const stopDrag = () => { isDragging.current = false; };

  const baseTile = basemapUrl
    ? <TileLayer url={basemapUrl} attribution="&copy; Copernicus / GEE" updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />
    : <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; CartoDB" />;

  return (
    <div className="space-y-0">
      {/* ── Year/Period selectors ── */}
      <div className="grid grid-cols-2 rounded-t-xl overflow-hidden border border-b-0 border-black">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-black border-r border-black">
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 shrink-0">← Before</span>
          <select value={leftYear} onChange={e => setLeftYear(Number(e.target.value))}
            className="bg-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-lg border border-zinc-600 outline-none cursor-pointer">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={leftPeriod} onChange={e => setLeftPeriod(e.target.value)}
            className="bg-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-lg border border-zinc-600 outline-none cursor-pointer">
            {COMPARE_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {leftLoading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin ml-auto" />}
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-black justify-end">
          {rightLoading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-auto" />}
          <select value={rightPeriod} onChange={e => setRightPeriod(e.target.value)}
            className="bg-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-lg border border-zinc-600 outline-none cursor-pointer">
            {COMPARE_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={rightYear} onChange={e => setRightYear(Number(e.target.value))}
            className="bg-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-lg border border-zinc-600 outline-none cursor-pointer">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 shrink-0">After →</span>
        </div>
      </div>

      {/* ── Single map with clipped left pane ── */}
      <div
        ref={containerRef}
        className="relative h-[420px] rounded-b-xl overflow-hidden border border-black shadow-sm select-none"
      >
        <MapContainer bounds={compareBounds} scrollWheelZoom zoomControl={false} doubleClickZoom={false}
          className="absolute inset-0 h-full w-full" style={{ backgroundColor: '#000000' }}>

          {/* Shared basemap — full width, no clip */}
          {baseTile}

          {/* Both LULC layers managed imperatively; SliderLayers owns the L.tileLayer refs
              and clips each container with CSS rect() as the slider moves */}
          <SliderLayers
            leftUrl={leftTile}
            rightUrl={rightTile}
            opacity={opacity}
            sliderPct={sliderPct}
          />
          <MapControls bounds={compareBounds} />
        </MapContainer>

        {/* Divider line */}
        <div className="absolute inset-y-0 z-[2000] pointer-events-none"
          style={{ left: `${sliderPct}%`, transform: 'translateX(-50%)' }}>
          <div className="w-0.5 h-full bg-white/90 shadow-[0_0_12px_rgba(0,0,0,0.6)]" />
        </div>

        {/* Drag handle — pointer events live here so setPointerCapture delivers moves directly */}
        <div
          className="absolute z-[2001] w-9 h-9 bg-white rounded-full shadow-xl flex items-center justify-center cursor-col-resize touch-none"
          style={{ left: `${sliderPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
          onPointerDown={startDrag}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
          </svg>
        </div>

        {/* Hint */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1001] bg-zinc-900/70 text-white text-[9px] px-3 py-1 rounded-full pointer-events-none whitespace-nowrap">
          Drag the handle to compare
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
//  TIME-SERIES COMPARE – single map, scrub or play through all periods
// ────────────────────────────────────────────────────────────────

function TimeSeriesCompare({ basemapUrl, opacity, classFilter, allPeriods }) {
  const allYears = useMemo(() => [...new Set(allPeriods.map(p => p.year))], [allPeriods]);
  const [selectedIdx, setSelectedIdx] = useState(0);  // debounced — controls tile
  const [draftIdx,    setDraftIdx]    = useState(0);  // immediate — controls badge + dot highlight
  const [tileCache, setTileCache]     = useState({});
  const [loadedCount, setLoadedCount] = useState(0);
  const debounceRef = useRef(null);

  // Cleanup debounce on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleScrub = (i) => {
    setDraftIdx(i);                                         // badge updates instantly
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSelectedIdx(i), 80); // tile updates after pause
  };

  const cacheKey = ({ year, period }) => `${year}-${period}`;
  const current        = allPeriods[selectedIdx];   // for tile URL (debounced)
  const displayCurrent = allPeriods[draftIdx];      // for badge (immediate)
  const allReady = loadedCount >= allPeriods.length;

  // Pre-fetch ALL period tile URLs in parallel whenever classFilter changes.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    setTileCache({});
    setLoadedCount(0);

    allPeriods.forEach(({ year, period }) => {
      fetch(`${API}/get-sar-map/${year}/${period}?layer=${classFilter}`, { signal })
        .then(r => r.json())
        .then(d => {
          if (signal.aborted) return;
          setTileCache(prev => ({ ...prev, [`${year}-${period}`]: d.tile_url || null }));
          setLoadedCount(prev => prev + 1);
        })
        .catch(() => {
          if (signal.aborted) return;
          setTileCache(prev => ({ ...prev, [`${year}-${period}`]: null }));
          setLoadedCount(prev => prev + 1);
        });
    });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  const currentTile  = tileCache[cacheKey(current)] ?? null;
  const isPeriodReady = (i) => cacheKey(allPeriods[i]) in tileCache;

  return (
    <div className="space-y-3">

      {/* ── Pre-load progress banner ── */}
      {!allReady && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <div className="w-3.5 h-3.5 border-2 border-[#3f7b56] border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-xs text-green-800 dark:text-green-300">
            Pre-loading all periods…&nbsp;
            <span className="font-black text-[#3f7b56] dark:text-[#a0d870]">{loadedCount}/{allPeriods.length}</span> ready
          </span>
          <div className="flex-1 h-1.5 bg-green-200 dark:bg-green-800/50 rounded-full overflow-hidden">
            <div className="h-full bg-[#3f7b56] transition-all duration-300"
              style={{ width: `${(loadedCount / allPeriods.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* ── Map (taller) ── */}
      <div className="relative h-[520px] rounded-xl overflow-hidden border border-zinc-200 shadow-sm">
        <MapContainer bounds={compareBounds} scrollWheelZoom zoomControl={false} doubleClickZoom={false}
          className="h-full w-full" style={{ backgroundColor: '#000000' }}>
          {basemapUrl
            ? <TileLayer url={basemapUrl} attribution="&copy; Copernicus / GEE" updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />
            : <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; CartoDB" />}
          {currentTile && <TileLayer key={currentTile + opacity} url={currentTile} opacity={opacity} updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />}
          <MapControls bounds={compareBounds} />
        </MapContainer>

        {/* Period badge */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-2 bg-zinc-900/85 backdrop-blur-sm text-white text-sm font-black px-4 py-1.5 rounded-full pointer-events-none">
          {displayCurrent.year} · {displayCurrent.period}
          {!isPeriodReady(draftIdx) && (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* ── Scrubber ── */}
      <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 space-y-3">
        {/* Range slider */}
        <input
          type="range"
          min={0}
          max={allPeriods.length - 1}
          value={draftIdx}
          onChange={e => handleScrub(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: '#3f7b56' }}
        />

        {/* Period dots — one group per year, spread evenly */}
        <div className="flex justify-between items-start select-none">
          {allYears.map(y => {
            const firstIdx = allPeriods.findIndex(p => p.year === y);
            const isYearActive = draftIdx >= firstIdx && draftIdx < firstIdx + 2;
            return (
              <div key={y} className="flex flex-col items-center gap-2">
                {/* S1 + S2 dots with more breathing room */}
                <div className="flex gap-4">
                  {['Jan-Jun', 'Jul-Dec'].map((period, pi) => {
                    const idx = allPeriods.findIndex(p => p.year === y && p.period === period);
                    const isSelected = idx === draftIdx;
                    const isReady = isPeriodReady(idx);
                    return (
                      <button
                        key={pi}
                        onClick={() => { setDraftIdx(idx); setSelectedIdx(idx); }}
                        title={`${y} · ${period}`}
                        className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                          isSelected
                            ? 'bg-[#3f7b56] border-[#3f7b56] scale-125 shadow-md'
                            : isReady
                              ? 'bg-[#4ade80] border-[#4ade80] hover:scale-110'
                              : 'bg-zinc-300 border-zinc-300 animate-pulse'
                        }`}
                      />
                    );
                  })}
                </div>
                {/* Year label */}
                <span className={`text-[9px] font-bold transition-colors duration-150 ${
                  isYearActive ? 'text-[#3f7b56]' : 'text-zinc-400'
                }`}>
                  {y}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current label + counter */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-[#3f7b56] dark:text-[#a0d870]">{displayCurrent.year} · {displayCurrent.period}</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{draftIdx + 1} / {allPeriods.length}</span>
        </div>
      </div>
    </div>
  );
}

const BASE_YEARS = [2021, 2022, 2023, 2024, 2025];

function CompareView({ basemapUrl }) {
  const [compareMode, setCompareMode] = useState('sidebyside'); // 'sidebyside' | 'slider' | 'timeseries'
  const [compareYears, setCompareYears] = useState(BASE_YEARS);
  const allPeriods = useMemo(
    () => compareYears.flatMap(y => [{ year: y, period: 'Jan-Jun' }, { year: y, period: 'Jul-Dec' }]),
    [compareYears]
  );

  useEffect(() => {
    fetch(`${API}/datasets/available`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const extra = data.filter(d => d.year).map(d => d.year);
        const years = [...new Set([...BASE_YEARS, ...extra])].sort((a, b) => a - b);
        setCompareYears(years);
      })
      .catch(() => {});
  }, []);

  const [leftYear, setLeftYear]       = useState(2021);
  const [leftPeriod, setLeftPeriod]   = useState('Jan-Jun');
  const [rightYear, setRightYear]     = useState(2024);
  const [rightPeriod, setRightPeriod] = useState('Jan-Jun');
  const [leftTile, setLeftTile]       = useState(null);
  const [rightTile, setRightTile]     = useState(null);
  const [leftLoading, setLeftLoading]   = useState(false);
  const [rightLoading, setRightLoading] = useState(false);
  const [classFilter, setClassFilter]   = useState('all');
  const [opacity, setOpacity]           = useState(0.5);

  // Location search
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults]     = useState(false);

  const leftMapRef  = useRef(null);
  const rightMapRef = useRef(null);
  const syncLock    = useRef(false);

  const fetchTile = useCallback(async (year, period, filter, side) => {
    const setLoading = side === 'left' ? setLeftLoading : setRightLoading;
    const setTile    = side === 'left' ? setLeftTile    : setRightTile;
    setLoading(true);
    try {
      const res  = await fetch(`${API}/get-sar-map/${year}/${period}?layer=${filter}`);
      const data = await res.json();
      setTile(data.tile_url || null);
    } catch { setTile(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTile(leftYear,  leftPeriod,  classFilter, 'left');  }, [leftYear,  leftPeriod,  classFilter, fetchTile]);
  useEffect(() => { fetchTile(rightYear, rightPeriod, classFilter, 'right'); }, [rightYear, rightPeriod, classFilter, fetchTile]);

  const handleSwap = () => {
    const [ty, tp] = [leftYear, leftPeriod];
    setLeftYear(rightYear);  setLeftPeriod(rightPeriod);
    setRightYear(ty);        setRightPeriod(tp);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setShowResults(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery, format: 'json', limit: 5,
        viewbox: '119.5,15.1,122.8,13.1', bounded: 1,
      });
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      const data = await res.json();
      setSearchResults(data);
    } catch { setSearchResults([]); }
    setSearchLoading(false);
  };

  const zoomToBoth = (result) => {
    const [south, north, west, east] = result.boundingbox.map(Number);
    const bounds = [[south, west], [north, east]];
    if (leftMapRef.current)  leftMapRef.current.fitBounds(bounds, { maxZoom: 14 });
    if (rightMapRef.current) rightMapRef.current.fitBounds(bounds, { maxZoom: 14 });
    setShowResults(false);
    setSearchQuery(result.display_name.split(',').slice(0, 2).join(','));
  };

  return (
    <div className="space-y-4">

      {/* ── Top toolbar: mode + search + opacity ── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* View mode selector */}
        <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">View</span>
          <select
            value={compareMode}
            onChange={e => setCompareMode(e.target.value)}
            className="bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-bold px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-600 outline-none cursor-pointer"
          >
            <option value="sidebyside">Side-by-Side</option>
            <option value="slider">Slider</option>
            <option value="timeseries">Time-Series</option>
          </select>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowResults(false); }}
              placeholder="Search a location in CALABARZON…"
              className="w-full border border-zinc-200 dark:border-zinc-600 rounded-lg pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#3f7b56]/30 focus:border-[#3f7b56]"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {showResults && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-[9999] overflow-hidden">
                {searchLoading && (
                  <div className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-[#3f7b56] border-t-transparent rounded-full animate-spin" />
                    Searching…
                  </div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">No locations found in CALABARZON.</div>
                )}
                {!searchLoading && searchResults.map((r, i) => (
                  <button key={i} type="button" onClick={() => zoomToBoth(r)}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-700 last:border-0 transition-colors">
                    <span className="font-bold text-zinc-800 dark:text-zinc-100 block truncate">{r.display_name.split(',').slice(0, 2).join(',')}</span>
                    <span className="text-zinc-400 text-[10px]">{r.type} · {r.display_name.split(',').slice(2, 4).join(',')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="px-3 py-2 bg-[#3f7b56] hover:bg-[#23432f] text-white text-xs font-bold rounded-lg transition-all shrink-0">
            Search
          </button>
        </form>

        {/* Opacity slider */}
        <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">LULC Opacity</span>
          <input type="range" min="0" max="1" step="0.05" value={opacity}
            onChange={e => setOpacity(parseFloat(e.target.value))}
            className="w-24 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-[#3f7b56]" />
          <span className="text-[10px] font-black font-mono text-zinc-700 dark:text-zinc-300 w-8">{Math.round(opacity * 100)}%</span>
        </div>
      </div>

      {/* ── Class filter (always visible) + Swap (side-by-side only) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 shrink-0">Show:</span>
        {COMPARE_CLASSES.map(cls => (
          <button key={cls.value} onClick={() => setClassFilter(cls.value)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all border ${
              classFilter === cls.value
                ? 'bg-[#3f7b56] text-white border-[#3f7b56]'
                : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-600'
            }`}>
            {cls.color && <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: cls.color }} />}
            {cls.label}
          </button>
        ))}
        {compareMode === 'sidebyside' && (
          <button onClick={handleSwap}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#23432f] to-[#1d5e3a] hover:opacity-90 text-white text-xs font-bold rounded-lg transition-all shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Swap
          </button>
        )}
      </div>

      {/* ── Map view (switches by mode) ── */}
      {compareMode === 'sidebyside' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ComparePanel
            label="← Before"    accentClass="text-blue-400"
            year={leftYear}     setYear={setLeftYear}
            period={leftPeriod} setPeriod={setLeftPeriod}
            tileUrl={leftTile}  basemapUrl={basemapUrl} opacity={opacity} loading={leftLoading}
            mapRef={leftMapRef}  otherRef={rightMapRef} lockRef={syncLock}
            years={compareYears}
          />
          <ComparePanel
            label="After →"      accentClass="text-amber-400"
            year={rightYear}     setYear={setRightYear}
            period={rightPeriod} setPeriod={setRightPeriod}
            tileUrl={rightTile}  basemapUrl={basemapUrl} opacity={opacity} loading={rightLoading}
            mapRef={rightMapRef} otherRef={leftMapRef}  lockRef={syncLock}
            years={compareYears}
          />
        </div>
      )}

      {compareMode === 'slider' && (
        <SliderCompare
          leftYear={leftYear}       setLeftYear={setLeftYear}
          leftPeriod={leftPeriod}   setLeftPeriod={setLeftPeriod}
          rightYear={rightYear}     setRightYear={setRightYear}
          rightPeriod={rightPeriod} setRightPeriod={setRightPeriod}
          leftTile={leftTile}       rightTile={rightTile}
          basemapUrl={basemapUrl}   opacity={opacity}
          leftLoading={leftLoading} rightLoading={rightLoading}
          years={compareYears}
        />
      )}

      {compareMode === 'timeseries' && (
        <TimeSeriesCompare
          basemapUrl={basemapUrl}
          opacity={opacity}
          classFilter={classFilter}
          allPeriods={allPeriods}
        />
      )}

      {/* ── Legend ── */}
      <div className="flex items-center justify-center gap-5 flex-wrap py-1">
        {Object.entries(CLASS_COLORS).map(([cls, color]) => (
          <div key={cls} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-xs font-bold text-zinc-600">{cls}</span>
          </div>
        ))}
        {compareMode === 'sidebyside'  && <span className="text-[10px] text-zinc-400 ml-2">· Scroll to zoom · Both maps stay in sync</span>}
        {compareMode === 'slider'      && <span className="text-[10px] text-zinc-400 ml-2">· Drag the handle left/right to reveal changes</span>}
        {compareMode === 'timeseries'  && <span className="text-[10px] text-zinc-400 ml-2">· Click a period or press Play to animate through time</span>}
      </div>

    </div>
  );
}

// ============================================================
//  MAIN ANALYSIS COMPONENT
// ============================================================

export default function Analysis({ sarUrl, basemapUrl, drawnPolygon, setDrawnPolygon, permissions = null, isLoggedIn = false }) {
  const can = (feature) => permissions === null || permissions?.[feature] !== false;
  const [activeTab, setActiveTab] = useState('lulc'); // 'lulc' | 'crop' | 'compare'
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [analysisYears, setAnalysisYears] = useState(BASE_YEARS);

  useEffect(() => {
    fetch(`${API}/datasets/available`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const extra = data.filter(d => d.year).map(d => d.year);
        const years = [...new Set([...BASE_YEARS, ...extra])].sort((a, b) => a - b);
        setAnalysisYears(years);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedSeason, setSelectedSeason] = useState('all');
  const [sarOpacity, setSarOpacity] = useState(0.5);
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

  // ── Abort controller for cancelling in-flight analysis requests ──
  const analysisAbortRef = useRef(null);

  // ── Download dialog state ──
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [dlOptions, setDlOptions] = useState([]);       // { id, label, checked }
  const [dlIncludeAvg, setDlIncludeAvg] = useState(true);
  const [dlTab, setDlTab] = useState('lulc');

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
    setSarOpacity(0.5); setDrawnPolygon(null);
    setAnalyticsData(null); setAnalysisError(null);
    setCropData(null); setCropError(null);
    setCropAreaData(null); setCropAreaError(null);
  };

  // ── Open download dialog ──
  const openDownloadDialog = () => {
    if (activeTab === 'lulc') {
      if (!analyticsData || analyticsData.length === 0) return;
      setDlTab('lulc');
      setDlOptions(analyticsData.map(e => ({ id: e.label, label: e.label, checked: true })));
    } else {
      if (!cropData?.yearly) return;
      setDlTab('crop');
      setDlOptions(cropData.yearly.map(yr => ({ id: String(yr.year), label: String(yr.year), checked: true })));
    }
    setDlIncludeAvg(true);
    setShowDownloadDialog(true);
  };

  const triggerCsvDownload = (rows, filename) => {
    const csv = '\uFEFF' + rows.map(r => r.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Execute download based on dialog selections ──
  const executeDownload = () => {
    const selected = new Set(dlOptions.filter(o => o.checked).map(o => o.id));
    setShowDownloadDialog(false);

    if (dlTab === 'lulc') {
      const filtered = analyticsData.filter(e => selected.has(e.label));
      if (filtered.length === 0) return;
      const rows = [['Period', 'Class', 'Pixel Count', 'Percentage (%)']];
      filtered.forEach(entry => {
        Object.entries(entry.classes).forEach(([cls, d]) => {
          rows.push([entry.label, cls, d.pixel_count, d.percentage]);
        });
      });
      if (dlIncludeAvg && filtered.length > 0) {
        const classes = Object.keys(filtered[0].classes);
        rows.push([]);
        classes.forEach(cls => {
          const avg = (filtered.reduce((s, e) => s + (e.classes[cls]?.percentage || 0), 0) / filtered.length).toFixed(2);
          rows.push([`Average (${startYear}-${endYear})`, cls, '', avg]);
        });
      }
      triggerCsvDownload(rows, `LULC_Analysis_${startYear}-${endYear}.csv`);
    } else {
      const filtered = cropData.yearly.filter(yr => selected.has(String(yr.year)));
      if (filtered.length === 0) return;
      const rows = [['Year', 'Intensity Label', 'Cropping Cycles', 'Active Months', 'Fallow Months', 'Utilization (%)', 'Max NDVI', 'Mean NDVI', 'Estimated Crops']];
      filtered.forEach(yr => {
        rows.push([
          yr.year, yr.intensity_label, yr.cropping_cycles,
          yr.active_months, yr.fallow_months, yr.utilization_percent,
          yr.max_ndvi, yr.mean_ndvi,
          yr.estimated_crops.map(c => c.crop).join(' | '),
        ]);
      });
      if (dlIncludeAvg) {
        const s = cropData.summary;
        rows.push([]);
        rows.push(['SUMMARY', '', s.average_cycles_per_year, '', '', s.average_utilization_percent, '', s.average_ndvi, s.dominant_crop]);
      }
      if (cropAreaData?.yearly_data) {
        const areaFiltered = cropAreaData.yearly_data.filter(yr => selected.has(String(yr.year)));
        if (areaFiltered.length > 0) {
          rows.push([]);
          rows.push(['Year', 'Crop Area (ha)', 'Total Area (ha)', 'Crop Coverage (%)']);
          areaFiltered.forEach(yr => {
            rows.push([yr.year, yr.crop_area_ha, yr.total_area_ha, yr.crop_percentage]);
          });
          if (dlIncludeAvg) {
            const avgPct = (areaFiltered.reduce((s, y) => s + (y.crop_percentage || 0), 0) / areaFiltered.length).toFixed(2);
            rows.push([`Average (${startYear}-${endYear})`, '', '', avgPct]);
          }
        }
      }
      triggerCsvDownload(rows, `Crop_Intensity_${startYear}-${endYear}.csv`);
    }
  };

  // ── Cancel any running analysis ──
  const handleCancelAnalysis = () => {
    analysisAbortRef.current?.abort();
    setIsAnalyzing(false);
    setIsCropAnalyzing(false);
    setAnalysisError(null);
    setCropError(null);
  };

  // ── Run LULC Analysis ──
  const handleRunLULC = async () => {
    if (!drawnPolygon) { setAnalysisError("Please draw your study area of interest using draw polygon first."); return; }
    if (!startYear || !endYear) { setAnalysisError("Please select your desired start and end year first."); return; }
    const ctrl = new AbortController();
    analysisAbortRef.current = ctrl;
    setIsAnalyzing(true); setAnalysisError(null); setAnalyticsData(null);
    try {
      const response = await fetch(`${API}/api/v1/analytics/lulc-change`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()), signal: ctrl.signal,
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
      if (error.name !== 'AbortError') setAnalysisError("Could not connect to the backend. Is FastAPI running on port 8000?");
    }
    setIsAnalyzing(false);
  };

  // ── Run Crop Intensity + Crop Area Coverage (parallel) ──
  const handleRunCropIntensity = async () => {
    if (!drawnPolygon) { setAnalysisError("Please draw your study area of interest using draw polygon first."); return; }
    if (!startYear || !endYear) { setAnalysisError("Please select your desired start and end year first."); return; }
    setIsCropAnalyzing(true);
    setCropError(null); setCropData(null);
    setCropAreaError(null); setCropAreaData(null);

    const payload = buildPayload();
    const ctrl = new AbortController();
    analysisAbortRef.current = ctrl;

    try {
      const [intensityResult, areaResult] = await Promise.allSettled([
        fetch(`${API}/api/v1/analytics/crop-intensity`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: ctrl.signal,
        }).then(r => r.json()),
        fetch(`${API}/api/v1/analytics/crop-area`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: ctrl.signal,
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
      if (error.name !== 'AbortError') setCropError("Could not connect to the backend. Is FastAPI running on port 8000?");
    }
    setIsCropAnalyzing(false);
  };

  const handleRunAnalysis = () => {
    if (activeTab === 'lulc') handleRunLULC();
    else if (activeTab === 'crop') handleRunCropIntensity();
  };

  return (
    <div className="w-full h-full relative z-0 bg-white dark:bg-zinc-900 p-4 lg:p-8 space-y-4 lg:space-y-6 overflow-y-auto pb-20 md:pb-8">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-100 dark:border-zinc-700 pb-4 lg:pb-6 gap-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-zinc-900 dark:text-zinc-100 leading-tight">Analysis Dashboard</h2>
          <p className="text-xs lg:text-sm text-zinc-500 dark:text-zinc-400 mt-1">Draw a study area and analyze land use or crop activity</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 p-1.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700">
            {can('lulc_analysis') && (
              <button onClick={() => setActiveTab('lulc')} className={`text-xs lg:text-sm font-bold px-4 py-2 rounded-lg transition ${activeTab === 'lulc' ? 'bg-white dark:bg-zinc-700 text-[#1d5e3a] dark:text-[#a0d870] shadow border border-green-100 dark:border-zinc-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-[#1d5e3a] dark:hover:text-[#a0d870]'}`}>
                LULC Change
              </button>
            )}
            {can('crop_intensity') && (
              <button onClick={() => setActiveTab('crop')} className={`text-xs lg:text-sm font-bold px-4 py-2 rounded-lg transition ${activeTab === 'crop' ? 'bg-white dark:bg-zinc-700 text-[#1d5e3a] dark:text-[#a0d870] shadow border border-green-100 dark:border-zinc-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-[#1d5e3a] dark:hover:text-[#a0d870]'}`}>
                Crop Intensity
              </button>
            )}
            {can('compare_view') && (
              <button onClick={() => setActiveTab('compare')} className={`text-xs lg:text-sm font-bold px-4 py-2 rounded-lg transition ${activeTab === 'compare' ? 'bg-white dark:bg-zinc-700 text-[#1d5e3a] dark:text-[#a0d870] shadow border border-green-100 dark:border-zinc-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-[#1d5e3a] dark:hover:text-[#a0d870]'}`}>
                Compare
              </button>
            )}
          </div>
          {activeTab !== 'compare' && (
          <button
            onClick={isLoggedIn ? openDownloadDialog : undefined}
            disabled={isLoggedIn && (activeTab === 'lulc' ? (!analyticsData || analyticsData.length === 0) : !cropData?.yearly)}
            title={!isLoggedIn ? 'Login to download CSV' : undefined}
            className={`flex items-center gap-1.5 lg:gap-2 text-white font-bold text-xs lg:text-sm bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg transition shadow-sm whitespace-nowrap ${!isLoggedIn ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed'}`}
          >
            <svg className="w-3 h-3 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download CSV
          </button>
          )}
        </div>
      </div>

      {/* ── Compare View (full-width, replaces the normal grid) ── */}
      {activeTab === 'compare' && can('compare_view') && <CompareView basemapUrl={basemapUrl} />}

      {/* ── Control Row (hidden on Compare tab) ── */}
      {activeTab !== 'compare' && <div className="flex flex-wrap lg:flex-nowrap items-stretch justify-start gap-2 lg:gap-4">
        <div className="flex items-center gap-2 lg:gap-3 bg-zinc-50 dark:bg-zinc-800 p-1.5 lg:p-2 rounded-xl border border-zinc-100 dark:border-zinc-700 flex-shrink-0">
          <span className="text-[9px] lg:text-[11px] font-bold text-[#23432f] dark:text-[#a0d870] uppercase tracking-wider ml-1 lg:ml-2">Range</span>
          <div className="flex items-center gap-1 lg:gap-2">
            <select value={startYear} onChange={(e) => { setStartYear(e.target.value); setEndYear(''); }} className="text-xs lg:text-sm font-bold text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 outline-none cursor-pointer">
              <option value="">– – –</option>
              {analysisYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-zinc-400 font-bold text-xs">—</span>
            <select value={endYear} onChange={(e) => setEndYear(e.target.value)} className="text-xs lg:text-sm font-bold text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-700 px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 outline-none cursor-pointer">
              <option value="">– – –</option>
              {analysisYears.filter(y => !startYear || y >= parseInt(startYear)).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {activeTab === 'lulc' && (
          <div className="flex items-center gap-2 lg:gap-4 bg-zinc-50 dark:bg-zinc-800 p-1.5 lg:p-2 rounded-xl border border-zinc-100 dark:border-zinc-700 px-3 lg:px-4 flex-shrink-0">
            <span className="text-[9px] lg:text-[11px] font-bold text-[#23432f] dark:text-[#a0d870] uppercase tracking-wider">Season</span>
            <div className="flex items-center gap-3 lg:gap-4">
              {[{ value: 'all', label: 'All' }, { value: 'Jan-Jun', label: 'Dry' }, { value: 'Jul-Dec', label: 'Wet' }].map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer hover:text-[#1d5e3a] dark:hover:text-[#a0d870] transition whitespace-nowrap">
                  <input type="radio" name="analysisSeason" value={opt.value} checked={selectedSeason === opt.value} onChange={(e) => setSelectedSeason(e.target.value)} className="w-3 h-3 lg:w-4 lg:h-4 accent-[#1d5e3a] cursor-pointer" /> {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 lg:gap-3 ml-auto">
          <button onClick={handleClearFilters} className="text-[10px] lg:text-xs font-bold text-[#23432f] dark:text-green-400 bg-white dark:bg-zinc-800 border border-[#23432f] dark:border-green-700 px-2 py-1 lg:px-4 lg:py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition whitespace-nowrap">Clear</button>
          {(isAnalyzing || isCropAnalyzing) ? (
            <button onClick={handleCancelAnalysis} className="text-[10px] lg:text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1 lg:px-5 lg:py-2 rounded-lg transition shadow-sm whitespace-nowrap flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Cancel
            </button>
          ) : (
            <button onClick={handleRunAnalysis} className="text-[10px] lg:text-xs font-bold text-white bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-3 py-1 lg:px-5 lg:py-2 rounded-lg hover:opacity-90 transition shadow-sm whitespace-nowrap">
              Run Analysis
            </button>
          )}
        </div>
      </div>}

      {/* ── Main Grid: Map + Results (hidden on Compare / Model tabs) ── */}
      {activeTab !== 'compare' && activeTab !== 'model' && <>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-4 lg:gap-6">
        {/* Left: Mini Map */}
        <div className="space-y-3">
          <CalabarzonMiniMap sarUrl={sarUrl} basemapUrl={basemapUrl} sarOpacity={sarOpacity} setSarOpacity={setSarOpacity} drawnPolygon={drawnPolygon} setDrawnPolygon={setDrawnPolygon} />
          {drawnPolygon ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span className="text-xs lg:text-sm text-green-800 dark:text-green-300 font-medium">Study area defined ({drawnPolygon.length} vertices). Click <strong>Run Analysis</strong>.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-xs lg:text-sm text-amber-800 dark:text-amber-300 font-medium">Click the <strong>pen icon</strong> on the map to draw your study area.</span>
            </div>
          )}
        </div>

        {/* Right: Results Panel */}
        <div className="space-y-4 lg:space-y-6">

          {/* ════════ LULC TAB ════════ */}
          {activeTab === 'lulc' && can('lulc_analysis') && (
            <>
              {!analyticsData && !isAnalyzing && !analysisError && <EmptyState message="No LULC results yet" sub="Draw a study area and click Run Analysis" />}
              {isAnalyzing && <LoadingState message="Processing LULC data in Google Earth Engine..." />}
              {analysisError && <ErrorState message={analysisError} />}
              {overallSummary && (
                <div className="border-2 border-[#1d5e3a]/20 dark:border-[#3f7b56]/30 rounded-xl p-4 lg:p-6 bg-gradient-to-br from-[#f0fdf4] dark:from-zinc-800 to-white dark:to-zinc-800 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm lg:text-base font-black text-[#1d5e3a] dark:text-[#a0d870] uppercase tracking-wide">Overall Land Cover Distribution</h3>
                      <p className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400 mt-1">Aggregated across <strong>{overallSummary.periods_counted} period{overallSummary.periods_counted > 1 ? 's' : ''}</strong> &middot; {overallSummary.range_label}</p>
                    </div>
                    <span className="text-[10px] lg:text-xs text-zinc-400 font-mono bg-white dark:bg-zinc-700 px-2 py-1 rounded-lg border border-zinc-100 dark:border-zinc-600">{overallSummary.total_pixels.toLocaleString()} total px</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
                    {CLASS_ORDER.map(cls => {
                      const data = overallSummary.classes[cls];
                      if (!data) return null;
                      return (
                        <div key={cls} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 lg:p-4 space-y-1 shadow-sm">
                          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-sm" style={{ backgroundColor: CLASS_COLORS[cls] }}></div><span className="text-[10px] lg:text-xs font-bold text-zinc-500 uppercase">{cls}</span></div>
                          <p className="text-xl lg:text-3xl font-black text-zinc-900 dark:text-zinc-100">{data.percentage}%</p>
                          <p className="text-[9px] lg:text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{data.pixel_count.toLocaleString()} px</p>
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
          {activeTab === 'crop' && can('crop_intensity') && (
            <>
              {!cropData && !isCropAnalyzing && !cropError && <EmptyState message="No crop intensity results yet" sub="Draw a study area and click Run Analysis" />}
              {isCropAnalyzing && <LoadingState message="Analyzing SAR & NDVI timelines for crop cycles..." />}
              {cropError && <ErrorState message={cropError} />}

              {/* Crop Summary Cards */}
              {cropData?.summary && (
                <div className="border-2 border-amber-200/50 dark:border-amber-800/50 rounded-xl p-4 lg:p-6 bg-gradient-to-br from-amber-50/50 dark:from-zinc-800 to-white dark:to-zinc-800 space-y-4">
                  <div>
                    <h3 className="text-sm lg:text-base font-black text-amber-800 dark:text-amber-300 uppercase tracking-wide flex items-center gap-2">
                      <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                      Crop Intensity Summary
                    </h3>
                    <p className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {cropData.summary.total_years_analyzed} year{cropData.summary.total_years_analyzed > 1 ? 's' : ''} analyzed &middot; Elevation: {cropData.summary.elevation_m}m
                    </p>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
                    <div className="bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Avg Cycles/Year</p>
                      <p className="text-xl lg:text-3xl font-black text-zinc-900 dark:text-zinc-100 mt-1">{cropData.summary.average_cycles_per_year}</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Avg Utilization</p>
                      <p className="text-xl lg:text-3xl font-black text-zinc-900 dark:text-zinc-100 mt-1">{cropData.summary.average_utilization_percent}%</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Avg NDVI</p>
                      <p className="text-xl lg:text-3xl font-black text-zinc-900 dark:text-zinc-100 mt-1">{cropData.summary.average_ndvi}</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl p-3 lg:p-4 shadow-sm">
                      <p className="text-[10px] lg:text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Dominant Crop</p>
                      <p className="text-base lg:text-xl font-black text-[#1d5e3a] dark:text-[#a0d870] mt-1 leading-tight">{cropData.summary.dominant_crop}</p>
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
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 lg:p-5 bg-white dark:bg-zinc-800 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-xs lg:text-sm font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                          <svg className="w-4 h-4 text-[#2d6a4f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                          Crop Area Coverage
                        </h4>
                        <p className="text-[10px] lg:text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Agriculture pixels present in both semesters</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div title="Average crop area percentage across all analyzed years" className="bg-zinc-50 dark:bg-zinc-700 border border-zinc-100 dark:border-zinc-600 rounded-lg px-3 py-1.5 text-center cursor-help">
                          <p className="text-[9px] text-zinc-400 dark:text-zinc-400 uppercase font-bold">Avg</p>
                          <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{avg}%</p>
                          <p className="text-[8px] text-zinc-400 mt-0.5">mean crop area</p>
                        </div>
                        <div title={`Change from ${yearly[0].year} to ${yearly[yearly.length-1].year}: ${parseFloat(diff) >= 0 ? 'increased' : 'decreased'} by ${Math.abs(diff)}%`} className={`rounded-lg px-3 py-1.5 text-center cursor-help ${parseFloat(diff) >= 0 ? 'bg-green-50 border border-green-100 dark:bg-green-950/30 dark:border-green-900' : 'bg-red-50 border border-red-100 dark:bg-red-950/30 dark:border-red-900'}`}>
                          <p className="text-[9px] text-zinc-400 uppercase font-bold">Trend</p>
                          <p className={`text-sm font-black ${parseFloat(diff) >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                            {parseFloat(diff) >= 0 ? '+' : ''}{diff}%
                          </p>
                          <p className="text-[8px] text-zinc-400 mt-0.5">first → last yr</p>
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
                          <tr className="border-b border-zinc-100 dark:border-zinc-700">
                            <th className="text-left py-2 px-3 font-bold text-zinc-500 dark:text-zinc-400">Year</th>
                            <th className="text-right py-2 px-3 font-bold text-zinc-500 dark:text-zinc-400">Coverage</th>
                            <th className="text-right py-2 px-3 font-bold text-zinc-500 dark:text-zinc-400">Crop Area (ha)</th>
                            <th className="text-right py-2 px-3 font-bold text-zinc-500 dark:text-zinc-400">Total Area (ha)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yearly.map(row => (
                            <tr key={row.year} className="border-b border-zinc-50 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition">
                              <td className="py-2 px-3 font-black text-zinc-900 dark:text-zinc-100">{row.year}</td>
                              <td className="py-2 px-3 text-right font-mono text-zinc-700 dark:text-zinc-300">{row.crop_percentage}%</td>
                              <td className="py-2 px-3 text-right font-mono text-zinc-700 dark:text-zinc-300">{row.crop_area_ha}</td>
                              <td className="py-2 px-3 text-right font-mono text-zinc-700 dark:text-zinc-300">{row.total_area_ha}</td>
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
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 lg:p-6 bg-zinc-50 dark:bg-zinc-800">
          <h4 className="text-xs lg:text-sm font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wide mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            Change Detection: {analyticsData[0].label} → {analyticsData[analyticsData.length - 1].label}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs lg:text-sm">
              <thead><tr className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-700"><th className="text-left py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500 dark:text-zinc-400">Land Use Class</th><th className="text-right py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500 dark:text-zinc-400">{analyticsData[0].label}</th><th className="text-right py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500 dark:text-zinc-400">{analyticsData[analyticsData.length - 1].label}</th><th className="text-right py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500 dark:text-zinc-400">Change</th><th className="text-left py-2 lg:py-3 px-2 lg:px-4 font-bold text-zinc-500 dark:text-zinc-400">Trend</th></tr></thead>
              <tbody>
                {Object.entries(changeDetection).sort((a, b) => Math.abs(b[1].diff) - Math.abs(a[1].diff)).map(([className, data]) => {
                  const diffNum = parseFloat(data.diff);
                  return (
                    <tr key={className} className="border-b border-zinc-100 dark:border-zinc-700 last:border-0 hover:bg-zinc-100/50 dark:hover:bg-zinc-700/50 transition">
                      <td className="py-2 lg:py-3 px-2 lg:px-4"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[className] || '#888' }}></div><span className="font-bold text-zinc-800 dark:text-zinc-200">{className}</span></div></td>
                      <td className="text-right py-2 lg:py-3 px-2 lg:px-4 font-mono text-zinc-700 dark:text-zinc-300">{data.start.toFixed(2)}%</td>
                      <td className="text-right py-2 lg:py-3 px-2 lg:px-4 font-mono text-zinc-700 dark:text-zinc-300">{data.end.toFixed(2)}%</td>
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
          <h4 className="text-xs lg:text-sm font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Per-Period Breakdown
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            {analyticsData.map((entry, idx) => {
              const prev = idx > 0 ? analyticsData[idx - 1] : null;
              return (
                <div key={idx} className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 lg:p-5 bg-zinc-50 dark:bg-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs lg:text-sm font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wide">{entry.label}</h5>
                    <span className="text-[10px] lg:text-xs text-zinc-400 dark:text-zinc-500 font-mono">{entry.total_pixels?.toLocaleString()} px</span>
                  </div>
                  <div className="space-y-2.5">
                    {Object.entries(entry.classes).sort((a, b) => b[1].percentage - a[1].percentage).map(([className, data]) => (
                      <div key={className} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[className] || '#888' }}></div><span className="text-xs lg:text-sm font-bold text-zinc-800 dark:text-zinc-100">{className}</span></div>
                          <div className="flex items-center gap-2"><ChangeIndicator current={data.percentage} previous={prev?.classes[className]?.percentage ?? null} /><span className="text-xs lg:text-sm font-black text-zinc-900 dark:text-white w-14 text-right">{data.percentage}%</span></div>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${data.percentage}%`, backgroundColor: CLASS_COLORS[className] || '#888' }}></div></div>
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
      {activeTab === 'crop' && can('crop_intensity') && cropData?.yearly && cropData.yearly.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-xs lg:text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wide flex items-center gap-2">
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
              <div key={idx} className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-800">
                {/* Year Header */}
                <div className="flex items-center justify-between p-4 lg:p-5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <div className="flex items-center gap-3">
                    <h5 className="text-base lg:text-lg font-black text-zinc-900 dark:text-white">{yr.year}</h5>
                    <span className={`text-[10px] lg:text-xs font-bold px-2.5 py-1 rounded-full border ${intensityStyle.bg} ${intensityStyle.text} ${intensityStyle.border}`}>
                      {yr.intensity_label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 lg:gap-6 text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400">
                    <span><strong className="text-zinc-800 dark:text-white">{yr.cropping_cycles}</strong> cycle{yr.cropping_cycles !== 1 ? 's' : ''}</span>
                    <span><strong className="text-zinc-800 dark:text-white">{yr.utilization_percent}%</strong> utilized</span>
                    <span><strong className="text-zinc-800 dark:text-white">{yr.active_months}</strong> active / <strong className="dark:text-white">{yr.fallow_months}</strong> fallow</span>
                  </div>
                </div>

                <div className="p-4 lg:p-5 space-y-5">
                  {/* Timelines */}
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-lg p-3 lg:p-4">
                    <TimelineChart data={ndviWithPeaks} dataKey="ndvi_mean" color="#15803d" label="Monthly Vegetation Health" unit="Greenness Index (0–1)" minVal={0} maxVal={1} />
                    {yr.peak_months.length > 0 && (
                      <p className="text-[9px] lg:text-[10px] text-zinc-400 dark:text-zinc-400 mt-2">
                        Peak months: <strong className="text-zinc-600 dark:text-zinc-200">{yr.peak_months.map(m => MONTH_LABELS[m - 1]).join(', ')}</strong>
                        <span className="inline-block w-2 h-2 bg-amber-400 rounded-full ml-1.5 align-middle ring-1 ring-offset-1 ring-amber-400"></span>
                      </p>
                    )}
                  </div>

                  {/* Estimated Crops */}
                  <div>
                    <p className="text-[10px] lg:text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Estimated Crop Types</p>
                    <div className="space-y-2">
                      {yr.estimated_crops.map((crop, ci) => (
                        <div key={ci} className="flex items-start gap-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700 rounded-lg p-3 lg:p-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs lg:text-sm font-black text-zinc-800 dark:text-white">{crop.crop}</span>
                              <span className={`text-[9px] lg:text-[10px] font-bold px-2 py-0.5 rounded-full ${CONFIDENCE_COLORS[crop.confidence]}`}>
                                {crop.confidence}
                              </span>
                            </div>
                            <p className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{crop.reasoning}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Stats Row */}
                  <div className="flex items-center gap-4 lg:gap-6 text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-700">
                    <span>Max NDVI: <strong className="text-zinc-800 dark:text-white">{yr.max_ndvi}</strong></span>
                    <span>Mean NDVI: <strong className="text-zinc-800 dark:text-white">{yr.mean_ndvi}</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>}

      {/* ── Download Options Dialog ── */}
      {showDownloadDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowDownloadDialog(false)}>
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between">
              <div>
                <h3 className="font-black text-zinc-900 dark:text-white text-sm">Download CSV</h3>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Select which data to include</p>
              </div>
              <button onClick={() => setShowDownloadDialog(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto sar-scrollbar">
              {/* Select All */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={dlOptions.every(o => o.checked)}
                  onChange={e => setDlOptions(prev => prev.map(o => ({ ...o, checked: e.target.checked })))}
                  className="w-4 h-4 rounded accent-[#3f7b56] cursor-pointer"
                />
                <span className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wide">Select All {dlTab === 'lulc' ? 'Periods' : 'Years'}</span>
              </label>

              <div className="border-t border-zinc-100 dark:border-zinc-700 pt-2 space-y-1.5">
                {dlOptions.map((opt, i) => (
                  <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer group px-1 py-0.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition">
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={e => setDlOptions(prev => prev.map((o, j) => j === i ? { ...o, checked: e.target.checked } : o))}
                      className="w-4 h-4 rounded accent-[#3f7b56] cursor-pointer"
                    />
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition">{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Average / Summary row toggle */}
              <div className="border-t border-zinc-100 dark:border-zinc-700 pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer group px-1 py-0.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition">
                  <input
                    type="checkbox"
                    checked={dlIncludeAvg}
                    onChange={e => setDlIncludeAvg(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#3f7b56] cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Include Average / Summary rows</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Appended at the bottom of the file</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-700 flex items-center justify-end gap-2">
              <button onClick={() => setShowDownloadDialog(false)} className="px-4 py-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition">
                Cancel
              </button>
              <button
                onClick={executeDownload}
                disabled={!dlOptions.some(o => o.checked)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#23432f] to-[#1d5e3a] rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Download
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}