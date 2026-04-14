import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// MAP MOVER 
function MapMover({ targetLocation }) {
  const map = useMap();
  useEffect(() => {
    if (targetLocation) {
      map.flyTo([targetLocation.lat, targetLocation.lng], targetLocation.zoom, {
        duration: 1.5
      });
    }
  }, [targetLocation, map]);
  return null;
}

// DYNAMIC LEGEND 
function ReactLegend({ showCropSuitability }) {
  return (
    <div className="legend absolute top-3 right-3 lg:top-4 lg:right-4 z-[2000] bg-zinc-900/80 backdrop-blur-sm p-3 lg:p-4 min-w-[140px] lg:min-w-[160px] rounded-lg border border-white/10 transition-all">
        <>
          <h4 className="text-white text-[10px] lg:text-xs font-bold uppercase tracking-widest mb-2 lg:mb-3 border-b border-white/30 pb-1 lg:pb-2 m-0 shadow-sm transition-all">
            Legend
          </h4>
          <div className="legend-item flex items-center mb-1.5 lg:mb-2">
            <i className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-yellow-500 mr-2 lg:mr-3 shadow-md transition-all"></i>
            <span className="text-white drop-shadow-md text-xs lg:text-sm font-bold transition-all">Agriculture</span>
          </div>
          <div className="legend-item flex items-center mb-1.5 lg:mb-2">
            <i className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-green-700 mr-2 lg:mr-3 shadow-md transition-all"></i>
            <span className="text-white drop-shadow-md text-xs lg:text-sm font-bold transition-all">Forest Cover</span>
          </div>
          <div className="legend-item flex items-center">
            <i className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-red-600 mr-2 lg:mr-3 shadow-md transition-all"></i>
            <span className="text-white drop-shadow-md text-xs lg:text-sm font-bold transition-all"> Urban</span>
          </div>
        </>
    </div>
  );
}

// CALABARZON STATS CARD
const CLASS_COLORS = { Water: '#1d4ed8', Urban: '#dc2626', Forest: '#15803d', Agriculture: '#ca8a04' };
const CLASS_ORDER  = ['Forest', 'Agriculture', 'Urban', 'Water'];

function CalabarzonStatsCard({ year, period }) {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!year || !period) return;
    let cancelled = false;
    setLoading(true);
    setStats(null);
    fetch(`http://127.0.0.1:8000/api/v1/analytics/calabarzon-stats/${year}/${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) { setStats(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, period]);

  return (
    <div className="absolute bottom-8 left-3 lg:left-4 z-[1000] bg-zinc-900/85 backdrop-blur-sm rounded-xl border border-white/10 p-3 min-w-[170px] transition-all">
      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
        CALABARZON · {year} {period}
      </p>
      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-xs py-1">
          <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          Loading stats...
        </div>
      )}
      {stats && CLASS_ORDER.map(cls => {
        const d = stats.classes[cls];
        if (!d) return null;
        return (
          <div key={cls} className="mb-1.5">
            <div className="flex justify-between items-center mb-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CLASS_COLORS[cls] }} />
                <span className="text-[10px] font-bold text-zinc-300">{cls}</span>
              </div>
              <span className="text-[10px] font-black text-white">{d.percentage}%</span>
            </div>
            <div className="w-full h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${d.percentage}%`, backgroundColor: CLASS_COLORS[cls] }} />
            </div>
          </div>
        );
      })}
      {!loading && !stats && (
        <p className="text-[10px] text-zinc-500">No TIF for this period</p>
      )}
    </div>
  );
}

// GEE TILE LAYER
function GEELayer({ url, opacity }) {
  if (!url) return null;
  return <TileLayer url={url} attribution="Google Earth Engine" opacity={opacity ?? 1.0} updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />;
}

// CLICK LISTENER 
function MapClickListener({ showProtected, showCropSuitability, setPopupInfo }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;

      // Neither layer is active — ignore click entirely
      if (!showProtected && !showCropSuitability) return;

      setPopupInfo({ lat, lng, loading: true });

      // Get Location Name via OpenStreetMap
      let locationText = "CALABARZON, Philippines";
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const geoData = await geoRes.json();
        if (geoData && geoData.address) {
          const city = geoData.address.city || geoData.address.town || geoData.address.municipality || geoData.address.village || "";
          const province = geoData.address.state || geoData.address.region || "Philippines";
          locationText = city ? `${city}, ${province}` : province;
        }
      } catch (geoError) {
        console.error("Could not fetch location name.");
      }

      if (showProtected) {
        // Check protected areas first
        try {
          const response = await fetch(`http://127.0.0.1:8000/query-protected-area?lat=${lat}&lng=${lng}`);
          const data = await response.json();
          if (data.found) {
            setPopupInfo({ type: 'protected', lat, lng, location: locationText, name: data.name, desig: data.desig, loading: false });
            return;
          }
        } catch (error) { /* fall through */ }

        // Not a protected area — check crop suitability if that layer is also on
        if (showCropSuitability) {
          try {
            const response = await fetch(`http://127.0.0.1:8000/query-crop-suitability?lat=${lat}&lng=${lng}`);
            const data = await response.json();
            if (data.found) {
              setPopupInfo({ type: 'crop', lat, lng, ...data, loading: false });
            } else {
              setPopupInfo({ type: 'error', lat, lng, message: data.reason === 'outside_calabarzon' ? 'Outside CALABARZON boundary.' : 'No data found at this location.', loading: false });
            }
          } catch (error) {
            setPopupInfo(null);
          }
        } else {
          setPopupInfo({ type: 'error', lat, lng, message: "No Protected Area found at this location.", loading: false });
        }

      } else if (showCropSuitability) {
        // Only crop suitability is on
        try {
          const response = await fetch(`http://127.0.0.1:8000/query-crop-suitability?lat=${lat}&lng=${lng}`);
          const data = await response.json();
          if (data.found) {
            setPopupInfo({ type: 'crop', lat, lng, ...data, loading: false });
          } else {
            setPopupInfo({ type: 'error', lat, lng, message: data.reason === 'outside_calabarzon' ? 'Outside CALABARZON boundary.' : 'No soil or terrain data found here.', loading: false });
          }
        } catch (error) {
          setPopupInfo(null);
        }
      } else {
        setPopupInfo(null);
      }
    }
  });
  return null;
}

// MAIN MAP COMPONENT 
export default function Map({ 
  basemapUrl, sarUrl, year, period, loading, targetLocation, 
  protectedUrl, showProtected, sarOpacity,
  cropSuitabilityUrl, showCropSuitability
}) {

  const [popupInfo, setPopupInfo] = useState(null);

  // Clear popup whenever a layer is toggled — the popup belongs to the active layer
  useEffect(() => { setPopupInfo(null); }, [showCropSuitability, showProtected]);

  const calabarzonBounds = [
    [13.1000, 119.5000], 
    [15.1000, 122.8000]  
  ];

  return (
    <div className="w-full h-screen relative z-0 bg-black">
      
      {loading && (
        <div className="absolute top-3 lg:top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-white px-3 py-1.5 lg:px-4 lg:py-2 rounded-full shadow-lg flex items-center gap-1.5 lg:gap-2 font-medium text-xs lg:text-sm text-zinc-700 transition-all">
          <div className="w-3.5 h-3.5 lg:w-4 lg:h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin transition-all"></div>
          Loading satellite data...
        </div>
      )}

      <ReactLegend showCropSuitability={showCropSuitability} />

      <MapContainer 
        bounds={calabarzonBounds} 
        scrollWheelZoom={true} 
        className="w-full h-full z-0"        
        minZoom={8}
        style={{ backgroundColor: '#172229' }} 
      >
        <MapMover targetLocation={targetLocation} />
        <MapClickListener 
          showProtected={showProtected} 
          showCropSuitability={showCropSuitability} 
          setPopupInfo={setPopupInfo} 
        />

        {/* RENDER LAYERS */}
        {basemapUrl && (
          <TileLayer key={`base-${year}-${period}`} url={basemapUrl} attribution="&copy; Copernicus" updateWhenZooming={false} keepBuffer={4} maxNativeZoom={15} maxZoom={18} />
        )}

        {sarUrl && !showCropSuitability && <GEELayer url={sarUrl} key={`sar-${sarUrl}`} opacity={sarOpacity} />}
        {cropSuitabilityUrl && showCropSuitability && <GEELayer url={cropSuitabilityUrl} key={`crop-${cropSuitabilityUrl}`} opacity={sarOpacity} />}
        {protectedUrl && <GEELayer url={protectedUrl} key={`pa-${protectedUrl}`} opacity={1.0} />}
        
        {/* POPUP UI */}
        {popupInfo && (
          <Popup position={[popupInfo.lat, popupInfo.lng]} onClose={() => setPopupInfo(null)} autoClose={false} closeOnClick={false}>
            <div className="font-sans min-w-[200px] lg:min-w-[240px] p-0.5 lg:p-1 transition-all">
              
              {popupInfo.loading ? (
                <div className="flex items-center gap-1.5 lg:gap-2 text-zinc-500 py-2 lg:py-3 px-1">
                  <div className="w-3.5 h-3.5 lg:w-4 lg:h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin transition-all"></div>
                  <span className="text-xs lg:text-sm font-medium transition-all">Analyzing location...</span>
                </div>
              ) : popupInfo.type === 'error' ? (
                <div className="text-red-500 font-bold text-xs lg:text-sm py-1.5 lg:py-2 px-1 text-center transition-all">
                  {popupInfo.message}
                </div>
              ) : popupInfo.type === 'protected' ? (
                <div className="space-y-2 lg:space-y-3 p-1 transition-all">
                  <div>
                    <h3 className="m-0 text-sm lg:text-base font-bold text-zinc-900 leading-tight transition-all">{popupInfo.name}</h3>
                  </div>
                  <div>
                    <p className="m-0 mb-0.5 text-[9px] lg:text-[10px] font-bold text-zinc-400 uppercase tracking-wider transition-all">Description</p>
                    <p className="m-0 text-xs lg:text-sm text-zinc-700 capitalize transition-all">{popupInfo.desig}</p>
                  </div>
                  <div>
                    <p className="m-0 mb-0.5 text-[9px] lg:text-[10px] font-bold text-zinc-400 uppercase tracking-wider transition-all">Location</p>
                    <p className="m-0 text-xs lg:text-sm text-zinc-700 transition-all">{popupInfo.location}</p>
                  </div>
                </div>
              ) : popupInfo.type === 'crop' ? (
                <div className="space-y-2.5 transition-all min-w-[260px]">
                  {/* Header */}
                  <div className="border-b border-zinc-100 pb-2">
                    <h3 className="m-0 text-sm font-black text-green-700 leading-tight">Crop Suitability</h3>
                    {popupInfo.location && (
                      <p className="m-0 mt-0.5 text-[10px] font-medium text-zinc-500">
                        {popupInfo.location.barangay}, {popupInfo.location.municipality}, {popupInfo.location.province}
                      </p>
                    )}
                  </div>

                  {/* LULC badge */}
                  <div className={`px-2 py-1 rounded text-[10px] font-bold ${popupInfo.lulc?.is_non_agri ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                    {popupInfo.lulc?.is_non_agri ? '⚠ ' : ''}Land Use: {popupInfo.lulc?.label ?? '—'}
                    {popupInfo.lulc?.is_non_agri && <span className="block font-normal mt-0.5">Not currently used for crops.</span>}
                  </div>

                  {/* Info strip: Soil + Crop Reco */}
                  <div className="grid grid-cols-2 gap-1.5 bg-zinc-50 p-1.5 rounded-lg border border-zinc-100">
                    <div>
                      <p className="m-0 text-[8px] font-bold text-zinc-400 uppercase">Soil Type</p>
                      <p className="m-0 text-[10px] font-black text-zinc-800 leading-tight">{popupInfo.soil ?? '—'}</p>
                    </div>
                    <div>
                      <p className="m-0 text-[8px] font-bold text-zinc-400 uppercase">Crop Reco</p>
                      <p className="m-0 text-[10px] font-black text-[#1d5e3a] leading-tight">{(popupInfo.terrain_recommendation || []).join(', ') || '—'}</p>
                    </div>
                  </div>

                  {/* Top crops dropdowns — only if agricultural */}
                  {!popupInfo.lulc?.is_non_agri && popupInfo.top_crops && (
                    <div className="space-y-1">
                      {[['Major Crops', 'major', '#1d5e3a'], ['Fruits', 'fruit', '#b45309'], ['Vegetables', 'vegetable', '#1d4ed8']].map(([title, key, color]) => {
                        const list = popupInfo.top_crops[key] || [];
                        if (!list.length) return null;
                        return (
                          <details key={key} className="rounded-lg border border-zinc-100 overflow-hidden">
                            <summary className="cursor-pointer px-3 py-1.5 text-[10px] font-black uppercase tracking-wider select-none list-none flex items-center justify-between" style={{ color, backgroundColor: `${color}10` }}>
                              {title}
                              <span className="text-zinc-400 font-normal text-[9px]">▼</span>
                            </summary>
                            <div className="px-3 py-1.5 space-y-0.5 bg-white">
                              {list.map((item, i) => (
                                <div key={i} className="flex justify-between text-[10px]">
                                  <span className="text-zinc-700">{i + 1}. {item.crop}</span>
                                  <span className="font-bold text-zinc-500">{item.rate}%</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

            </div>
          </Popup>
        )}

      </MapContainer>

      <CalabarzonStatsCard year={year} period={period} />
    </div>
  );
}