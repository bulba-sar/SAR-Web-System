import { useEffect, useState } from 'react';
import Sidebar from './components/sidebar';
import Map from './components/map';
import FilterPanel from './components/filter-panel';
import Analysis from './components/analysis';
import Profile from './components/profile';
import Admin from './components/admin';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

export default function App() {
  const [activeNav, setActiveNav] = useState(() => sessionStorage.getItem('sar_nav') || 'filters');
  useEffect(() => { sessionStorage.setItem('sar_nav', activeNav); }, [activeNav]);
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

  // Admin AOIs — fetched once on mount, displayed on the map for all users
  const [adminAois, setAdminAois] = useState([]);
  useEffect(() => {
    fetch(`${API}/aois`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setAdminAois(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Filter panel visibility (desktop collapse + mobile overlay)
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Dark mode — persisted to localStorage
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('sar_dark') === '1');
  useEffect(() => { localStorage.setItem('sar_dark', darkMode ? '1' : '0'); }, [darkMode]);

  // Backend wake-up detection — Render free tier sleeps when idle
  const [backendReady, setBackendReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(8000) });
        if (res.ok && !cancelled) { setBackendReady(true); return; }
      } catch {}
      if (!cancelled) setTimeout(ping, 4000);
    };
    ping();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auth-derived state: admin flag + role permissions
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState(null); // null = all features on (guest/default)

  const fetchAuthState = () => {
    const token = localStorage.getItem('sar_token');
    if (!token) { setIsAdmin(false); setPermissions(null); return; }
    fetch(`${API}/profile/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (!user) { setIsAdmin(false); setPermissions(null); return; }
        setIsAdmin(['Admin', 'Government Official'].includes(user.role));
        return fetch(`${API}/profile/permissions`, {
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
        const response = await fetch(`${API}/get-protected-areas`);
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
    fetch(`${API}/get-satellite-basemap`)
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
        const sarResponse = await fetch(`${API}/get-sar-map/${year}/${period}?layer=${activeLayer}`);
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
        const response = await fetch(`${API}/get-crop-suitability/${year}/${period}`);
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
        const response = await fetch(`${API}/get-agri-layer`);
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
    <div className={`flex h-screen w-full bg-zinc-100 dark:bg-zinc-950 overflow-hidden${darkMode ? ' dark' : ''}`}>
      
      {/* Backend wake-up banner (Render free tier cold start) */}
      {!backendReady && (
        <div className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/80 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium shadow-sm">
          <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>Backend is starting up — map data will load in a few seconds. Please wait…</span>
        </div>
      )}

      {/* 1. The Slim Icon Sidebar (Always Visible) */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={(id) => {
          if (id === 'filters') {
            if (activeNav === 'filters') {
              setPanelOpen(p => !p);
            } else {
              setActiveNav('filters');
              setPanelOpen(true);
            }
          } else {
            setActiveNav(id);
          }
        }}
        isAdmin={isAdmin}
        permissions={permissions}
        darkMode={darkMode}
        toggleDark={() => setDarkMode(d => !d)}
      />

      {/* 2. DYNAMIC CONTENT AREA */}
      {activeNav === 'profile' ? (

        // SHOW PROFILE DASHBOARD
        <div className="flex-1 h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-900 pb-16 md:pb-0">
          <Profile drawnPolygon={drawnPolygon} onLoadAOI={handleLoadAOI} permissions={permissions} onAuthChange={fetchAuthState} darkMode={darkMode} toggleDark={() => setDarkMode(d => !d)} />
        </div>

      ) : activeNav === 'admin' ? (

        // SHOW ADMIN PANEL
        <div className="flex-1 h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-900 pb-16 md:pb-0">
          <Admin />
        </div>

      ) : activeNav === 'analysis' ? (

        // SHOW THIS WHEN "ANALYSIS" IS CLICKED
        <div className="flex-1 h-full overflow-hidden bg-white dark:bg-zinc-900">
          <Analysis sarUrl={sarUrl} basemapUrl={basemapUrl} drawnPolygon={drawnPolygon} setDrawnPolygon={setDrawnPolygon} permissions={permissions} isLoggedIn={!!localStorage.getItem('sar_token')} />
        </div>

      ) : (

        // SHOW THE MAP & FILTERS FOR EVERYTHING ELSE
        <>
          {/* Desktop: collapsible inline filter panel */}
          {panelOpen && (
            <div className="hidden md:block">
              <FilterPanel
                activeNav={activeNav}
                year={year} setYear={setYear}
                period={period} setPeriod={setPeriod}
                activeLayer={activeLayer} setActiveLayer={setActiveLayer}
                setTargetLocation={setTargetLocation}
                showProtected={showProtected} setShowProtected={setShowProtected}
                sarOpacity={sarOpacity} setSarOpacity={setSarOpacity}
                showCropSuitability={showCropSuitability} setShowCropSuitability={setShowCropSuitability}
                permissions={permissions}
                onTogglePanel={() => setPanelOpen(false)}
              />
            </div>
          )}

          {/* Mobile: filter slide-over overlay */}
          {mobileFilterOpen && (
            <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileFilterOpen(false)}>
              <div className="absolute inset-y-0 left-0 w-[85vw] max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
                <FilterPanel
                  activeNav={activeNav}
                  year={year} setYear={setYear}
                  period={period} setPeriod={setPeriod}
                  activeLayer={activeLayer} setActiveLayer={setActiveLayer}
                  setTargetLocation={setTargetLocation}
                  showProtected={showProtected} setShowProtected={setShowProtected}
                  sarOpacity={sarOpacity} setSarOpacity={setSarOpacity}
                  showCropSuitability={showCropSuitability} setShowCropSuitability={setShowCropSuitability}
                  permissions={permissions}
                  onTogglePanel={() => setMobileFilterOpen(false)}
                />
              </div>
            </div>
          )}

          {/* Map — full screen on mobile */}
          <div className="flex-1 relative z-0 pb-16 md:pb-0">
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
              adminAois={adminAois}
            />
            {/* Mobile: floating filter button */}
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="md:hidden absolute top-4 left-4 z-[400] bg-white dark:bg-zinc-800 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300"
            >
              <svg className="w-4 h-4 text-[#305d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              Filters
            </button>
          </div>
        </>

      )}
      
    </div>
  );
}