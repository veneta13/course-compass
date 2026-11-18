import React from 'react';
import { Compass } from 'lucide-react';
import Navbar from './components/Navbar';
import UserProfile from './components/UserProfile';
import FinderPage from './pages/FinderPage';
import MatchesPage from './pages/MatchesPage';
import CatalogPage from './pages/CatalogPage';
import CourseDetailPage from './pages/CourseDetailPage';
import PlanPage from './pages/PlanPage';
import { AppStateProvider, useAppState } from './state/AppState';
import { Link, useRoute } from './lib/router';
import { CURRENT_SEMESTER, DEMO } from './config';

function Page({ route }) {
  switch (route.name) {
    case 'finder':
      return <FinderPage />;
    case 'matches':
      return <MatchesPage />;
    case 'catalog':
      return <CatalogPage />;
    case 'course':
      return <CourseDetailPage key={route.params.id} courseId={route.params.id} />;
    case 'plan':
      return <PlanPage />;
    case 'profile':
      return <UserProfile />;
    default:
      return (
        <div className="py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
          <Link to="/" className="text-sm text-blue-700 font-semibold underline mt-3 inline-block">
            Go to the start page
          </Link>
        </div>
      );
  }
}

function DemoBanner() {
  const { resetDemo } = useAppState();
  return (
    <div className="bg-amber-100 text-amber-900 text-xs border-b border-amber-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between gap-3">
        <span>
          <strong>Demo mode</strong> · invented courses and a sample student, not real TUM data
        </span>
        <button type="button" onClick={resetDemo} className="font-semibold underline shrink-0 cursor-pointer">
          Reset demo
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  return (
    <AppStateProvider>
      <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans">
        {DEMO && <DemoBanner />}
        <Navbar route={route} />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
          <Page route={route} />
        </main>
        <footer className="border-t border-slate-200/80 bg-white py-6 mt-12 pb-24 md:pb-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-600 shrink-0" />
              <p>Course Compass · Data-informed curriculum planning for TU Munich</p>
            </div>
            <span>{CURRENT_SEMESTER.label}</span>
          </div>
        </footer>
      </div>
    </AppStateProvider>
  );
}
