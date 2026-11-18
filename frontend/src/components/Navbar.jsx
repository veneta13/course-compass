import React from 'react';
import { CalendarDays, Compass, Library, Sparkles } from 'lucide-react';
import { Link } from '../lib/router';
import { useAppState } from '../state/AppState';
import { CURRENT_SEMESTER } from '../config';

const TABS = [
  { key: 'matches', to: '/matches', label: 'Matches', icon: Sparkles, routes: ['finder', 'matches'] },
  { key: 'catalog', to: '/courses', label: 'Catalog', icon: Library, routes: ['catalog', 'course'] },
  { key: 'plan', to: '/plan', label: 'My plan', icon: CalendarDays, routes: ['plan'] },
];

export default function Navbar({ route }) {
  const { profile, plan } = useAppState();
  const hasProfile = profile.interestText.trim().length > 0 || profile.completedCourses.length > 0;
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase() || 'ME';
  const tabTarget = (t) => (t.key === 'matches' && !hasProfile ? '/' : t.to);

  return (
    <>
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 sm:gap-3 select-none shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Compass className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">Course Compass</span>
              <span className="text-slate-400 text-sm hidden lg:inline">for TU Munich</span>
            </div>
          </Link>

          {/* Desktop tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            {TABS.map((t) => {
              const active = t.routes.includes(route.name);
              return (
                <Link
                  key={t.key}
                  to={tabTarget(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${active ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t.label}
                  {t.key === 'plan' && plan.length > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-blue-600 text-white text-[10px]">{plan.length}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50/80 border border-blue-200/60 text-blue-700 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              {CURRENT_SEMESTER.label}
            </div>
            <Link
              to="/profile"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900 text-white font-semibold text-xs flex items-center justify-center hover:ring-2 hover:ring-blue-500/30 transition"
              title="Your profile"
            >
              {initials}
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-3 pb-[env(safe-area-inset-bottom)]" aria-label="Main">
        {TABS.map((t) => {
          const active = t.routes.includes(route.name);
          const Icon = t.icon;
          return (
            <Link key={t.key} to={tabTarget(t)} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? 'text-blue-700' : 'text-slate-500'}`}>
              <Icon className="w-5 h-5" />
              {t.label}
              {t.key === 'plan' && plan.length > 0 && (
                <span className="absolute top-1 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] leading-4 text-center">{plan.length}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
