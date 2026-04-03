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
    <div className="legend absolute top-4 right-4 z-[2000] bg-zinc-900/80 backdrop-blur-sm p-4 min-w-[160px] rounded-lg border border-white/10">
      
      {showCropSuitability ? (
        <>
          <h4 className="text-white text-xs font-bold uppercase tracking-widest mb-3 border-b border-white/30 pb-2 m-0 shadow-sm">
            Crop Suitability
          </h4>
          <div className="legend-item flex items-center mb-2">
            <i className="w-3 h-3 rounded-full bg-cyan-500 mr-3 shadow-md"></i>
            <span className="text-white drop-shadow-md text-sm font-bold">Lowland (Rice)</span>
          </div>
          <div className="legend-item flex items-center mb-2">
            <i className="w-3 h-3 rounded-full bg-yellow-500 mr-3 shadow-md"></i>
            <span className="text-white drop-shadow-md text-sm font-bold">Upland (Corn)</span>
          </div>
          <div className="legend-item flex items-center">
            <i className="w-3 h-3 rounded-full bg-purple-500 mr-3 shadow-md"></i>
            <span className="text-white drop-shadow-md text-sm font-bold">Highland (Coffee)</span>
          </div>
        </>
      ) : (
        <>
          <h4 className="text-white text-xs font-bold uppercase tracking-widest mb-3 border-b border-white/30 pb-2 m-0 shadow-sm">
            Legend
          </h4>
          <div className="legend-item flex items-center mb-2">
            <i className="w-3 h-3 rounded-full bg-yellow-500 mr-3 shadow-md"></i>
            <span className="text-white drop-shadow-md text-sm font-bold">Agriculture</span>
          </div>
          <div className="legend-item flex items-center mb-2">
            <i className="w-3 h-3 rounded-full bg-green-700 mr-3 shadow-md"></i>
            <span className="text-white drop-shadow-md text-sm font-bold">Forest Cover</span>
          </div>
          <div className="legend-item flex items-center">
            <i className="w-3 h-3 rounded-full bg-red-600 mr-3 shadow-md"></i>
            <span className="text-white drop-shadow-md text-sm font-bold"> Urban</span>
          </div>
        </>
      )}
    </div>
  );
}

// GEE TILE LAYER
function GEELayer({ url, opacity }) {
  if (!url) return null; 
  return <TileLayer url={url} attribution="Google Earth Engine" opacity={opacity || 1.0} />;
}

// CLICK LISTENER 
function MapClickListener({ showProtected, showCropSuitability, setPopupInfo }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
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
        // Protected Areas
        try {
          const response = await fetch(`http://127.0.0.1:8000/query-protected-area?lat=${lat}&lng=${lng}`);
          const data = await response.json();
          if (data.found) {
            setPopupInfo({ type: 'protected', lat, lng, location: locationText, name: data.name, desig: data.desig, loading: false });
          } else {
            setPopupInfo({ type: 'error', lat, lng, message: "No Protected Area found at this location.", loading: false });
          }
        } catch (error) {
          setPopupInfo(null);
        }
      } else if (showCropSuitability) {
        // Crop Suitability 
        try {
          const response = await fetch(`http://127.0.0.1:8000/query-crop-suitability?lat=${lat}&lng=${lng}`);
          const data = await response.json();
          if (data.found) {
            setPopupInfo({ 
              type: 'crop', lat, lng, location: locationText, 
              soilName: data.soilName, slope: data.slope, ndvi: data.ndvi, 
              crops: data.crops, reasons: data.reasons, loading: false 
            });
          } else {
            setPopupInfo({ type: 'error', lat, lng, message: "No soil or terrain data found here.", loading: false });
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
  protectedUrl, showProtected, sarOpacity, agriUrl,
  cropSuitabilityUrl, showCropSuitability 
}) {

  const [popupInfo, setPopupInfo] = useState(null);
  
  const calabarzonBounds = [
    [13.1000, 119.5000], 
    [15.1000, 122.8000]  
  ];

  return (
    <div className="w-full h-screen relative z-0 bg-black">
      
      {loading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 font-medium text-sm text-zinc-700">
          <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
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

        {basemapUrl && (
          <TileLayer key={`base-${year}-${period}`} url={basemapUrl} attribution="&copy; Copernicus" />
        )}

        {/* RENDER LAYERS */}
        {basemapUrl && (
          <TileLayer key={`base-${year}-${period}`} url={basemapUrl} attribution="&copy; Copernicus" />
        )}
        
        {sarUrl && !showCropSuitability && <GEELayer url={sarUrl} key={`sar-${sarUrl}`} opacity={sarOpacity} />}
        {agriUrl && showCropSuitability && <GEELayer url={agriUrl} key="agri-guide" opacity={sarOpacity} />}
        {cropSuitabilityUrl && showCropSuitability && <GEELayer url={cropSuitabilityUrl} key={`crop-${cropSuitabilityUrl}`} opacity={sarOpacity} />}
        {protectedUrl && <GEELayer url={protectedUrl} key={`pa-${protectedUrl}`} opacity={1.0} />}
        
        {/* POPUP UI */}
        {popupInfo && (
          <Popup position={[popupInfo.lat, popupInfo.lng]} onClose={() => setPopupInfo(null)}>
            <div className="font-sans min-w-[240px] p-1">
              
              {popupInfo.loading ? (
                <div className="flex items-center gap-2 text-zinc-500 py-3 px-1">
                  <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium">Analyzing location...</span>
                </div>
              ) : popupInfo.type === 'error' ? (
                <div className="text-red-500 font-bold text-sm py-2 px-1 text-center">
                  {popupInfo.message}
                </div>
              ) : popupInfo.type === 'protected' ? (
                <div className="space-y-3 p-1">
                  <div>
                    <h3 className="m-0 text-base font-bold text-zinc-900 leading-tight">{popupInfo.name}</h3>
                  </div>
                  <div>
                    <p className="m-0 mb-0.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Description</p>
                    <p className="m-0 text-sm text-zinc-700 capitalize">{popupInfo.desig}</p>
                  </div>
                  <div>
                    <p className="m-0 mb-0.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Location</p>
                    <p className="m-0 text-sm text-zinc-700">{popupInfo.location}</p>
                  </div>
                </div>
              ) : popupInfo.type === 'crop' ? (
                <div className="space-y-4">
                  <div className="border-b border-zinc-200 pb-2">
                    <h3 className="m-0 text-base font-black text-green-700 leading-tight flex items-center gap-2">
                       Crop Suitability
                    </h3>
                    <p className="m-0 mt-1 text-xs font-medium text-zinc-500">{popupInfo.location}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                    <div>
                      <p className="m-0 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Soil Type</p>
                      <p className="m-0 text-xs font-bold text-zinc-800 truncate" title={popupInfo.soilName}>
                        {popupInfo.soilName}
                      </p>
                    </div>
                    <div>
                      <p className="m-0 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Terrain</p>
                      <p className="m-0 text-xs font-bold text-zinc-800">
                        Slp: {popupInfo.slope?.toFixed(1) || 0}° | NDVI: {popupInfo.ndvi?.toFixed(2) || 0}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="m-0 mb-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Recommended Crops</p>
                    <div className="space-y-2.5 max-h-[150px] overflow-y-auto pr-1">
                      {popupInfo.crops.map((crop, index) => (
                        <div key={index} className="leading-tight">
                          <span className="font-bold text-sm text-zinc-800 block">{crop}</span>
                          <span className="text-[11px] text-zinc-500 block mt-0.5">• {popupInfo.reasons[index]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

            </div>
          </Popup>
        )}

      </MapContainer>
    </div>
  );
}