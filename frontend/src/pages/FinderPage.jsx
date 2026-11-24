import React from 'react';
import { ArrowRight } from 'lucide-react';
import InterestInputCard from '../components/InterestInputCard';
import TranscriptUploadCard from '../components/TranscriptUploadCard';
import PreferencesCard from '../components/PreferencesCard';
import ProfileInsightsCard from '../components/ProfileInsightsCard';
import RecommendationSourcesCard from '../components/RecommendationSourcesCard';
import { useAppState } from '../state/AppState';
import { navigate } from '../lib/router';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';

export default function FinderPage() {
  const { profile, updateProfile } = useAppState();
  const processing = profile.files.some((f) => f.status === 'processing');
  const { data: courses } = useAsync(() => api.listCourses(), []);
  const canSearch = profile.interestText.trim().length > 0 || profile.completedCourses.length > 0;

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <div className="text-xs font-bold text-blue-700 tracking-wider uppercase mb-3">Step 1 of 2 · Your profile</div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3">Find the courses that actually fit you.</h1>
        <p className="text-slate-600 text-sm sm:text-base max-w-3xl leading-relaxed">
          Tell us what you are curious about and share your transcript or CV. We match you against this semester's offering, past course statistics and student opinions,
          then explain every pick.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-7 space-y-6 min-w-0">
          <InterestInputCard interestText={profile.interestText} setInterestText={(v) => updateProfile((p) => ({ interestText: typeof v === 'function' ? v(p.interestText) : v }))} />
          <TranscriptUploadCard />
          <PreferencesCard />

          <div className="pt-1 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
            <div className="text-xs text-slate-500 flex items-center gap-1.5 justify-center sm:justify-start">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>{courses ? `${courses.length} courses offered this semester in your program` : "Loading this semester's offering…"}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/matches')}
              disabled={!canSearch || processing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 transition shadow-sm shadow-blue-600/20 cursor-pointer"
            >
              <span>{processing ? 'Reading your documents…' : 'Find my courses'}</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>
          {!canSearch && <p className="text-xs text-slate-400 text-center sm:text-right -mt-3">Describe your interests or upload a transcript to continue.</p>}
        </div>

        <div className="lg:col-span-5 space-y-6 min-w-0">
          <ProfileInsightsCard />
          <RecommendationSourcesCard />
        </div>
      </div>
    </div>
  );
}
