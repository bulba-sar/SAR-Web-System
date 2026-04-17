import { useEffect, useState } from 'react';
import Sidebar from './components/sidebar';
import Map from './components/map';
import FilterPanel from './components/filter-panel';
import Analysis from './components/analysis';
import Profile from './components/profile';
import Admin from './components/admin';

export default function App() {
  const [activeNav, setActiveNav] = useState('filters');
  const [targetLocation, setTargetLocation] = useState(null);
  
  // Map Layer Toggles
  const [showProtected, setShowProtected] = useState(false);
  const [showCropSuitability, setShowCropSuitability] = useState(false); 
  
  // Map Data URLs
  const [protectedUrl, setProtectedUrl] = useState(null);
  const [sarUrl, setSarUrl] = useState(null);
  const [basemapUrl, setBasemapUrl] = useState(null); 
  const [agriLayerUrl, setAgriLayerUrl] = useState(null);
  const [cropSuitabilityUrl, setCropSuitabilityUrl] = useState(null); 
  
  // Map Configurations
  const [year, setYear] = useState(2025);
  const [period, setPeriod] = useState("Jan-Jun");
  const [activeLayer, setActiveLayer] = useState('all');
  const [sarOpacity, setSarOpacity] = useState(0.5);
  const [loading, setLoading] = useState(false);

  // Drawn polygon — lifted here so Profile can save/load AOIs
  const [drawnPolygon, setDrawnPolygon] = useState(null);

  // Auth-derived state: admin flag + role permissions
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState(null); // null = all features on (guest/default)

  const fetchAuthState = () => {
    const token = localStorage.getItem('sar_token');
    if (!token) { setIsAdmin(false); setPermissions(null); return; }
    fetch('http://127.0.0.1:8000/profile/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (!user) { setIsAdmin(false); setPermissions(null); return; }
        setIsAdmin(['Admin', 'Government Official'].includes(user.role));
        return fetch('http://127.0.0.1:8000/profile/permissions', {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then(r => r?.json())
      .then(data => { if (data?.permissions) setPermissions(data.permissions); })
      .catch(() => { setIsAdmin(false); setPermissions(null); });
  };

  useEffect(() => { fetchAuthState(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load a saved AOI: populate polygon + switch to Analysis view
  const handleLoadAOI = (polygonPoints) => {
    setDrawnPolygon(polygonPoints);
    setActiveNav('analysis');
  };

  // --- 1. Fetch Protected Areas ---
  useEffect(() => {
    const fetchProtectedAreas = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/get-protected-areas');
        const data = await response.json();
        setProtectedUrl(data.tile_url || null);
      } catch (error) {
        console.error("Cannot fetch protected areas.", error);
      }
    };
    
    fetchProtectedAreas();
  }, []);

  // --- 2a. Fetch Basemap once on mount (single shared composite, never changes) ---
  useEffect(() => {
    fetch('http://127.0.0.1:8000/get-satellite-basemap')
      .then(r => r.json())
      .then(data => {
        if (data.error) console.error("Basemap Backend Error:", data.error);
        else console.log("Basemap Loaded:", data.tile_url);
        setBasemapUrl(data.tile_url || null);
      })
      .catch(err => console.error("Cannot fetch basemap.", err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- 2b. Fetch SAR layer whenever year / period / layer changes ---
  useEffect(() => {
    const fetchMaps = async () => {
      setLoading(true);
      try {
        const sarResponse = await fetch(`http://127.0.0.1:8000/get-sar-map/${year}/${period}?layer=${activeLayer}`);
        const sarData = await sarResponse.json();
        if (sarData.error) console.error("SAR Backend Error:", sarData.error);
        else console.log("SAR Map Loaded Successfully:", sarData.tile_url);
        setSarUrl(sarData.tile_url || null);
      } catch (error) {
        console.error("Cannot connect to FastAPI. Is your backend running on port 8000?", error);
      }
      setLoading(false);
    };

    fetchMaps();
  }, [year, period, activeLayer]);

  // --- 3. Fetch Crop Suitability Map ---
  useEffect(() => {
    const fetchCropSuitability = async () => {
      if (!showCropSuitability) {
        setCropSuitabilityUrl(null);
        return;
      }
      
      try {
        const response = await fetch(`http://127.0.0.1:8000/get-crop-suitability/${year}/${period}`);
        const data = await response.json();
        setCropSuitabilityUrl(data.tile_url || null);
      } catch (error) {
        console.error("Cannot connect to FastAPI for Crop Suitability.", error);
      }
    };

    fetchCropSuitability();
  }, [year, period, showCropSuitability]);

  // --- 4. Fetch Agricultural Layer ---
  useEffect(() => {
    async function fetchAgriLayer() {
      try {
        const response = await fetch("http://127.0.0.1:8000/get-agri-layer");
        const data = await response.json();
        
        if (data.status === "success") {
          setAgriLayerUrl(data.url);
        }
      } catch (error) {
        console.error("Failed to load Agri layer", error);
      }
    }
    
    fetchAgriLayer();
  }, []);

// --- 5. Render UI ---
  return (
    <div className="flex h-screen w-full bg-zinc-100 overflow-hidden">
      
      {/* 1. The Slim Icon Sidebar (Always Visible) */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        isAdmin={isAdmin}
        permissions={permissions}
      />

      {/* 2. DYNAMIC CONTENT AREA */}
      {activeNav === 'profile' ? (

        // SHOW PROFILE DASHBOARD
        <div className="flex-1 h-full overflow-y-auto bg-zinc-50">
          <Profile drawnPolygon={drawnPolygon} onLoadAOI={handleLoadAOI} permissions={permissions} onAuthChange={fetchAuthState} />
        </div>

      ) : activeNav === 'admin' ? (

        // SHOW ADMIN PANEL
        <div className="flex-1 h-full overflow-y-auto bg-zinc-50">
          <Admin />
        </div>

      ) : activeNav === 'analysis' ? (

        // SHOW THIS WHEN "ANALYSIS" IS CLICKED
        <div className="flex-1 h-full overflow-hidden bg-white">
          <Analysis sarUrl={sarUrl} basemapUrl={basemapUrl} drawnPolygon={drawnPolygon} setDrawnPolygon={setDrawnPolygon} permissions={permissions} />
        </div>

      ) : (

        // SHOW THE MAP & FILTERS FOR EVERYTHING ELSE
        <>
          <FilterPanel
            activeNav={activeNav}
            year={year}
            setYear={setYear}
            period={period}
            setPeriod={setPeriod}
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            setTargetLocation={setTargetLocation}
            showProtected={showProtected}
            setShowProtected={setShowProtected}
            sarOpacity={sarOpacity}
            setSarOpacity={setSarOpacity}
            showCropSuitability={showCropSuitability}
            setShowCropSuitability={setShowCropSuitability}
            permissions={permissions}
          />
          
          <div className="flex-1 relative z-0">
            <Map 
              basemapUrl={basemapUrl} 
              sarUrl={sarUrl} 
              year={year} 
              period={period} 
              loading={loading}
              targetLocation={targetLocation}
              protectedUrl={showProtected ? protectedUrl : null} 
              showProtected={showProtected}
              sarOpacity={sarOpacity}
              agriUrl={agriLayerUrl}
              cropSuitabilityUrl={showCropSuitability ? cropSuitabilityUrl : null}
              showCropSuitability={showCropSuitability}
            />
          </div>
        </>

      )}
      
    </div>
  );
}