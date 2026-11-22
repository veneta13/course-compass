import React, { useState } from 'react';
import Navbar from './components/Navbar';
import InterestInputCard from './components/InterestInputCard';
import TranscriptUploadCard from './components/TranscriptUploadCard';
import ProfileInsightsCard from './components/ProfileInsightsCard';
import RecommendationSourcesCard from './components/RecommendationSourcesCard';
import UserProfile from './components/UserProfile';
import { ArrowRight, Compass, User, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('finder'); // 'finder' | 'profile'
  const [interestText, setInterestText] = useState('');
  const [files, setFiles] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);

  const handleFindCourses = (e) => {
    e.preventDefault();
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      setSearchSubmitted(true);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar currentView={currentView} setCurrentView={setCurrentView} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {currentView === 'profile' ? (
          <UserProfile onNavigateToFinder={() => setCurrentView('finder')} />
        ) : (
          <div>
            {/* Step Indicator & Header */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-xs font-bold text-blue-700 tracking-wider uppercase mb-3">
                <Compass className="w-3.5 h-3.5 text-blue-600 animate-[spin_10s_linear_infinite]" />
                <span>STEP 1 OF 2 · YOUR PROFILE</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3">
                Find the courses that actually fit you.
              </h1>
              <p className="text-slate-600 text-sm sm:text-base max-w-3xl leading-relaxed">
                Tell us what you are curious about and share your transcript or CV. We match you
                against this semester's offering, past course statistics and student opinions, then explain every pick.
              </p>
            </div>

            {/* 2-Column Responsive Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Interactive Inputs */}
              <div className="lg:col-span-7 space-y-6">
                <InterestInputCard
                  interestText={interestText}
                  setInterestText={setInterestText}
                />

                <TranscriptUploadCard
                  files={files}
                  setFiles={setFiles}
                />

                {/* Search status notification if submitted */}
                {searchSubmitted && (
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Matching algorithm initialized with your criteria and TUM database courses.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSearchSubmitted(false)}
                      className="text-blue-600 font-semibold hover:underline ml-2"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Action Bar */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>214 courses offered this semester in Informatics & Data Science</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleFindCourses}
                    disabled={isSearching}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 transition shadow-sm shadow-blue-600/20 cursor-pointer"
                  >
                    <span>{isSearching ? 'Matching Courses...' : 'Find My Courses'}</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.2]" />
                  </button>
                </div>
              </div>

              {/* Right Column: Profile Insights & Context */}
              <div className="lg:col-span-5 space-y-6">
                <ProfileInsightsCard interestText={interestText} files={files} />
                <RecommendationSourcesCard />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-blue-600 shrink-0" />
            <p>Course Compass · Data-informed curriculum planning for Technical University of Munich</p>
          </div>
          <div className="flex gap-4">
            <span>TUM Winter 2026/27</span>
            <span>•</span>
            <button
              type="button"
              onClick={() => setCurrentView(currentView === 'profile' ? 'finder' : 'profile')}
              className="hover:text-slate-600 transition underline cursor-pointer"
            >
              {currentView === 'profile' ? 'Course Matcher' : 'My Student Profile'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
