import { useState } from 'react';

// ── About / Methodology Modal ──────────────────────────────────────────────
function AboutModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto z-10">

        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#23432f] to-[#1d5e3a] px-6 py-4 rounded-t-2xl flex items-start justify-between gap-4">
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

        <div className="p-6 space-y-6 text-sm text-zinc-700">

          {/* What is this */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">About</h3>
            <p className="text-xs leading-relaxed text-zinc-600">
              This web system maps Land Use and Land Cover (LULC) across the CALABARZON region of the Philippines
              using Synthetic Aperture Radar (SAR) imagery from the Sentinel-1 satellite. It was developed as a
              thesis project to support agricultural monitoring and land management decisions.
            </p>
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
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>Sentinel-1 SAR</strong> — C-band SAR imagery from ESA, acquired bi-annually (Jan–Jun and Jul–Dec).</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>Google Earth Engine (GEE)</strong> — Used for SAR processing, classification, and tile generation.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>FAO GAUL / GADM</strong> — Administrative boundary data for CALABARZON.</span></li>
              <li className="flex gap-2"><span className="text-[#1d5e3a] font-black shrink-0">·</span><span><strong>Philippine Soil Series</strong> — Soil classification shapefile for crop suitability context.</span></li>
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
            <ol className="text-xs text-zinc-600 space-y-1.5 list-none">
              {[
                'Sentinel-1 SAR images are composited bi-annually (dry: Jan–Jun, wet: Jul–Dec) using GEE.',
                'Backscatter intensity features (VV, VH polarizations) are extracted and normalized.',
                'A supervised classification model assigns each pixel to one of four LULC classes.',
                'Classified rasters are exported as GeoTIFFs and served locally via rio-tiler.',
                'Change detection is computed by comparing pixel distributions across periods.',
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#1d5e3a] font-black shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
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
export default function Sidebar({ activeNav, setActiveNav }) {
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

  return (
    <>
      <div className="w-20 lg:w-24 h-screen bg-[#f0f2f2] border-r border-zinc-200 flex flex-col justify-between py-4 lg:py-6 z-20 shadow-sm transition-all">

        {/* Top Section */}
        <div className="flex flex-col w-full items-center space-y-2 lg:space-y-4">

          {/* Logo */}
          <div className="mb-2 lg:mb-4">
            <img
              src="/logo3.png"
              alt="SAR CALABARZON Logo"
              className="w-10 h-10 lg:w-12 lg:h-12 object-contain transition-all"
            />
          </div>

          <NavItem
            id="filters"
            label="Filters"
            icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>}
          />
          <NavItem
            id="analysis"
            label="Analysis"
            icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 20V10H14V20H18ZM12 20V4H8V20H12ZM6 20V14H2V20H6Z" /></svg>}
          />
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col w-full items-center gap-2">

          {/* About / Info button */}
          <button
            onClick={() => setShowAbout(true)}
            className="w-full flex flex-col items-center justify-center py-4 lg:py-5 border-l-4 border-transparent text-zinc-500 hover:bg-black/5 hover:text-zinc-900 transition-all"
            title="About & Methodology"
          >
            <svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[9px] lg:text-[10px] mt-1 lg:mt-1.5 font-bold tracking-wider uppercase transition-all">About</span>
          </button>

          <NavItem
            id="profile"
            label="Profile"
            icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
          />
        </div>

      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  );
}
