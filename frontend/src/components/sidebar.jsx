import React from 'react';

export default function Sidebar({ activeNav, setActiveNav }) {

  // Reusable icon button using your exact hex codes
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
    // Changed background to #f0f2f2
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

        {/* The Navigation Icons */}
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
        <NavItem 
          id="comparison" 
          label="Comparison" 
          icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
        />
        {/* <NavItem 
          id="profile" 
          label="Profile" 
          icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
        /> */}
      </div>


      {/* Bottom Section */}
      <div className="flex flex-col w-full items-center">
        <NavItem
          id="profile"
          label="Profile"
          icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
        />
      </div>

    </div>
  );
}