import React from 'react';

export default function Sidebar({ activeNav, setActiveNav }) {
  
  // Reusable icon button using your exact hex codes
  const NavItem = ({ id, label, icon }) => {
    const isActive = activeNav === id;
    return (
      <button
        onClick={() => setActiveNav(id)}
        className={`w-full flex flex-col items-center justify-center py-4 lg:py-5 border-l-4 transition-all ${
          isActive 
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
        
        {/* Minimalist Logo / Brand */}
        <div className="mb-2 lg:mb-4">
          <div className="w-8 h-8 lg:w-10 lg:h-10 bg-[#305d3d]/10 rounded-xl flex items-center justify-center border border-[#305d3d]/20 transition-all">
             <span className="text-[#305d3d] font-black text-base lg:text-lg transition-all">B</span>
          </div>
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
          id="feedback" 
          label="Feedback" 
          icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
        />
        <NavItem 
          id="profile" 
          label="Profile" 
          icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
        />
      </div>
        

      {/* Bottom Section */}
      <div className="flex flex-col w-full items-center">
         <NavItem 
          id="settings" 
          label="Settings" 
          icon={<svg className="w-5 h-5 lg:w-6 lg:h-6 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
      </div>

    </div>
  );
}