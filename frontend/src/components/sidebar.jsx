import { useState } from 'react';

// ── About / Methodology Modal ──────────────────────────────────────────────
function AboutModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col z-10 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-6 py-4 rounded-t-2xl flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-base font-black text-white leading-tight">SAR-LULC Web System</h2>
            <p className="text-[11px] text-green-200 mt-0.5">CALABARZON Land Use / Land Cover Monitoring</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-zinc-700 overflow-y-auto flex-1">

          {/* What is this */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">About</h3>
            <p className="text-xs leading-relaxed text-zinc-600">
              This web system maps Land Use and Land Cover (LULC) across the CALABARZON region of the Philippines
              using a fusion of <strong>Sentinel-1 SAR</strong> (Synthetic Aperture Radar) and <strong>Sentinel-2
              multispectral</strong> satellite imagery. Developed as a thesis project, it supports agricultural
              monitoring and land management decisions through bi-annual classification powered by a supervised
              Random Forest model running on Google Earth Engine.
            </p>
            {/* Satellite highlight pills */}
            <div className="flex gap-2 pt-1">
              <div className="flex-1 bg-[#1d4ed8]/8 border border-[#1d4ed8]/20 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#1d4ed8]" />
                  <span className="text-[10px] font-black text-[#1d4ed8]">Sentinel-1 SAR</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">C-band radar · IW mode · VV + VH polarizations · all-weather, day &amp; night imaging</p>
              </div>
              <div className="flex-1 bg-[#15803d]/8 border border-[#15803d]/20 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#15803d]" />
                  <span className="text-[10px] font-black text-[#15803d]">Sentinel-2 MSI</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">Multispectral · 10m resolution · 6 bands · cloud-masked · NDVI &amp; NDWI indices</p>
              </div>
            </div>
          </section>

          {/* Study Area */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">Study Area</h3>
            <p className="text-xs leading-relaxed text-zinc-600">
              CALABARZON (Region IV-A) — comprising <strong>Cavite, Laguna, Batangas, Rizal,</strong> and <strong>Quezon</strong> provinces.
              The region is one of the most economically active in the Philippines, with significant agricultural,
              forested, and urbanizing areas.
            </p>
          </section>

          {/* Data Sources */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">Data Sources</h3>
            <ul className="text-xs text-zinc-600 space-y-1.5">
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>Sentinel-1 GRD</strong> — C-band SAR (IW mode, VV+VH polarizations) from ESA/Copernicus. Bi-annual median composites filtered to &lt;40% cloud cover.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>Sentinel-2 SR Harmonized</strong> — Multispectral optical imagery (10m). Cloud-masked via QA60 band. Bands: B2, B3, B4, B8, B11, B12.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>Google Dynamic World V1</strong> — Near-real-time land cover, used as primary gap-fill for unclassified pixels.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>ESA WorldCover v100</strong> — 10m global land cover map; secondary gap-fill fallback after Dynamic World.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>JRC Global Surface Water v1.4</strong> — Permanent water occurrence layer used to enforce water body boundaries and correct mountain shadows.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>USGS SRTMGL1 (30m DEM)</strong> — Elevation data for computing terrain slope, used to identify and correct SAR shadow artifacts.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>GADM Level 3 (gadm41_PHL_3)</strong> — Administrative boundary asset hosted in GEE for clipping and regional analysis.</span></li>
            </ul>
          </section>

          {/* LULC Classes */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">LULC Classifications</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { cls: 'Forest',      color: '#15803d', desc: 'Closed-canopy and open forest areas, including natural and secondary growth.' },
                { cls: 'Agriculture', color: '#ca8a04', desc: 'Croplands, farmlands, and active agricultural areas detected via SAR backscatter.' },
                { cls: 'Urban',       color: '#dc2626', desc: 'Built-up areas including settlements, commercial zones, and infrastructure.' },
                { cls: 'Water',       color: '#1d4ed8', desc: 'Rivers, lakes, reservoirs, and other permanent or seasonal water bodies.' },
              ].map(({ cls, color, desc }) => (
                <div key={cls} className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-black text-zinc-800">{cls}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Methodology */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">Methodology</h3>
            <ol className="text-xs text-zinc-600 space-y-2 list-none">
              {[
                { title: 'Data Acquisition & Compositing', body: 'Sentinel-1 (VV, VH) and Sentinel-2 (optical) collections are filtered bi-annually and reduced to median composites. Sentinel-2 images are cloud-masked using the QA60 bitmask before compositing.' },
                { title: 'Feature Engineering (13-band composite)', body: 'The input stack includes 6 Sentinel-2 bands, NDVI, NDWI, NDVI temporal std dev, VV temporal std dev, VV, VH, and terrain slope. Temporal std dev features help distinguish agriculture (high variance) from permanent water (near-zero variance).' },
                { title: 'Supervised RF Classification', body: 'A 250-tree Random Forest classifier is trained on 200+ manually labeled points split 70% train / 30% test. Each pixel is classified into Water, Urban, Forest, or Agriculture based on its 13 feature values.' },
                { title: 'Spatial Post-Processing Pipeline', body: 'Gap pixels are filled first with Dynamic World, then ESA WorldCover. A majority filter (1.2-pixel circle kernel) smooths class edges. A sieve filter removes isolated patches smaller than 8 pixels, reclassifying them as Forest.' },
                { title: 'Water & Shadow Correction', body: 'Mountain shadows (SAR often misreads them as water) are corrected using SRTM slope > 5° combined with JRC permanent water absence. True permanent water bodies are enforced from the JRC occurrence layer.' },
                { title: 'Export & Tile Serving', body: 'Final maps are exported from GEE as single-band uint8 GeoTIFFs (class values 0–3; 255 = outside CALABARZON). Files are stored in the backend and served as 256×256 XYZ PNG tiles via FastAPI + rio-tiler with the LULC colormap applied at render time.' },
              ].map(({ title, body }, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#1d5e3a] font-black shrink-0 mt-px">{i + 1}.</span>
                  <span><strong className="text-zinc-800">{title}:</strong> {body}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Tech Stack */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">Technology Stack</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Google Earth Engine', desc: 'Cloud geospatial processing — compositing, classification, export' },
                { name: 'FastAPI + rio-tiler', desc: 'Python backend serving local GeoTIFFs as XYZ map tiles' },
                { name: 'React + Leaflet', desc: 'Interactive frontend map with overlays and polygon analysis' },
                { name: 'Random Forest (GEE)', desc: '250-tree ensemble classifier with 13-band SAR/optical features' },
              ].map(({ name, desc }) => (
                <div key={name} className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 space-y-1">
                  <span className="text-[10px] font-black text-[#1d5e3a]">{name}</span>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Coverage */}
          <section className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 space-y-1">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">Temporal Coverage</h3>
            <p className="text-xs text-zinc-600">2021 – 2025 &nbsp;·&nbsp; Bi-annual periods (Jan–Jun and Jul–Dec)</p>
            <p className="text-[10px] text-zinc-400 mt-1">Data is updated as new Sentinel-1 composites are processed and exported from GEE.</p>
          </section>

        </div>
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────
// null permissions = guest, treat all features as enabled
const can = (permissions, feature) => permissions === null || permissions?.[feature] !== false;

export default function Sidebar({ activeNav, setActiveNav, isAdmin = false, permissions = null }) {
  const [showAbout, setShowAbout] = useState(false);

  const NavItem = ({ id, label, icon }) => {
    const isActive = activeNav === id;
    return (
      <button
        onClick={() => setActiveNav(id)}
        className={`w-full flex flex-col items-center justify-center py-4 lg:py-5 border-l-4 transition-all ${isActive
            ? 'border-[#305d3d] bg-[#305d3d]/10 text-[#305d3d]'
            : 'border-transparent text-zinc-500 hover:bg-black/5 hover:text-zinc-900'
          }`}
      >
        {icon}
        <span className="text-[9px] lg:text-[10px] mt-1 lg:mt-1.5 font-bold tracking-wider uppercase transition-all">{label}</span>
      </button>
    );
  };

  const MobileNavItem = ({ id, label, icon }) => {
    const isActive = activeNav === id;
    return (
      <button
        onClick={() => setActiveNav(id)}
        className={`flex flex-col items-center justify-center flex-1 gap-0.5 transition-all ${isActive
          ? 'text-[#305d3d] bg-[#305d3d]/10'
          : 'text-zinc-500 hover:bg-black/5 hover:text-zinc-900'
        }`}
      >
        {icon}
        <span className="text-[9px] font-bold tracking-wider uppercase">{label}</span>
      </button>
    );
  };

  return (
    <>
      {/* ── Desktop: vertical sidebar (hidden on mobile) ── */}
      <div className="hidden md:flex w-20 lg:w-24 h-screen bg-[#f0f2f2] border-r border-zinc-200 flex-col justify-between py-4 lg:py-6 z-20 shadow-sm transition-all">

        {/* Top Section */}
        <div className="flex flex-col w-full items-center space-y-2 lg:space-y-4">
          <div className="mb-2 lg:mb-4">
            <img src="/logo3.png" alt="SAR CALABARZON Logo" className="w-10 h-10 lg:w-12 lg:h-12 object-contain transition-all" />
          </div>
          <NavItem id="filters" label="Filters" icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>} />
          {can(permissions, 'analysis_tab') && (
            <NavItem id="analysis" label="Analysis" icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 20V10H14V20H18ZM12 20V4H8V20H12ZM6 20V14H2V20H6Z" /></svg>} />
          )}
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col w-full items-center gap-2">
          <button onClick={() => setShowAbout(true)} className="w-full flex flex-col items-center justify-center py-4 lg:py-5 border-l-4 border-transparent text-zinc-500 hover:bg-black/5 hover:text-zinc-900 transition-all" title="About & Methodology">
            <svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-[9px] lg:text-[10px] mt-1 lg:mt-1.5 font-bold tracking-wider uppercase transition-all">About</span>
          </button>
          <NavItem id="profile" label="Profile" icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
          {isAdmin && (
            <NavItem id="admin" label="Admin" icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>} />
          )}
        </div>
      </div>

      {/* ── Mobile: fixed bottom navigation bar ── */}
      <div className="flex md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-[#f0f2f2] border-t border-zinc-200 shadow-lg">
        <MobileNavItem id="filters" label="Map" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>} />
        {can(permissions, 'analysis_tab') && (
          <MobileNavItem id="analysis" label="Analysis" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 20V10H14V20H18ZM12 20V4H8V20H12ZM6 20V14H2V20H6Z" /></svg>} />
        )}
        <button onClick={() => setShowAbout(true)} className="flex flex-col items-center justify-center flex-1 gap-0.5 text-zinc-500 hover:bg-black/5 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-[9px] font-bold tracking-wider uppercase">About</span>
        </button>
        <MobileNavItem id="profile" label="Profile" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} />
        {isAdmin && (
          <MobileNavItem id="admin" label="Admin" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>} />
        )}
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  );
}
