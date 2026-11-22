import React from 'react';
import { Compass, Sparkles, UserCircle } from 'lucide-react';

export default function Navbar({ currentView, setCurrentView }) {
  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div 
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => setCurrentView('finder')}
        >
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Compass className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-slate-900 text-lg tracking-tight">Course Compass</span>
            <span className="text-slate-400 text-sm hidden sm:inline">for TU Munich</span>
          </div>
        </div>

        {/* Center / Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setCurrentView('finder')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              currentView === 'finder'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Course Matcher
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              currentView === 'profile'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Profile
          </button>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <div className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50/80 border border-blue-200/60 text-blue-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            Winter 2026/27
          </div>

          <button
            type="button"
            onClick={() => setCurrentView('profile')}
            className="w-9 h-9 rounded-full bg-slate-900 text-white font-semibold text-xs flex items-center justify-center border-2 border-white shadow-xs hover:ring-2 hover:ring-blue-500/30 transition cursor-pointer"
            title="View Student Profile"
          >
            TS
          </button>
        </div>
      </div>
    </header>
  );
}
