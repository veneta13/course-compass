import React from 'react';
import { Info } from 'lucide-react';
import { useAppState } from '../state/AppState';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { useDebounced } from '../lib/useDebounced';

const EMPTY = { interests: [], constraints: [], strong: [], gaps: [], learning_style: null };

function Section({ title, children }) {
  return (
    <div>
      <span className="block text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2">{title}</span>
      {children}
    </div>
  );
}

function Pills({ items, tone }) {
  const cls = tone === 'gap' ? 'bg-amber-900/50 text-amber-100' : tone === 'pref' ? 'bg-[#1e293b] text-blue-200 border border-blue-500/30' : 'bg-slate-800 text-slate-200';
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cls}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export default function ProfileInsightsCard() {
  const { profile } = useAppState();
  // Ask the backend (Profile builder) once typing pauses.
  const inputs = useDebounced(profile);
  const key = JSON.stringify([inputs.interestText, inputs.completedCourses, inputs.skills, inputs.languagePref, inputs.maxHoursPerWeek]);
  const { data, error } = useAsync(() => api.getProfileInsights(inputs), [key]);
  const notConnected = error?.status === 501;
  const insights = data || EMPTY;
  const hasData = profile.interestText.trim().length > 0 || profile.completedCourses.length > 0 || profile.skills.length > 0;
  const style = insights.learning_style;

  return (
    <div className="bg-[#0f172a] rounded-2xl p-5 sm:p-6 text-white shadow-lg border border-slate-800">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-white tracking-tight">What we understood so far</h2>
        <span className={`w-2 h-2 rounded-full ${hasData ? 'bg-emerald-400' : 'bg-slate-500'}`} aria-hidden />
      </div>

      {notConnected && hasData ? (
        <p className="text-xs text-slate-400 leading-relaxed">
          Your saved inputs will be analysed here once the recommender is connected to the server.
        </p>
      ) : !hasData ? (
        <div className="py-6 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
          <Info className="w-6 h-6 text-slate-500 mx-auto" />
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Describe your interests or upload your transcript, and we will show what we picked up here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.interests.length > 0 && (
            <Section title="Interested in">
              <Pills items={insights.interests} />
            </Section>
          )}
          {insights.strong.length > 0 && (
            <Section title="Strong in">
              <Pills items={insights.strong} />
            </Section>
          )}
          {insights.gaps.length > 0 && (
            <Section title="Gaps to watch">
              <Pills items={insights.gaps} tone="gap" />
            </Section>
          )}
          {insights.constraints.length > 0 && (
            <Section title="Preferences">
              <Pills items={insights.constraints} tone="pref" />
            </Section>
          )}
          {style && (
            <Section title="Learning style">
              <p className="text-xs text-slate-300 leading-relaxed">
                {style.prefers_hands_on
                  ? `Better grades in project-based and seminar courses (avg ${style.hands_on_average.toFixed(1)}) than in written exams (avg ${style.written_average.toFixed(1)}).`
                  : `Similar results in written exams (avg ${style.written_average.toFixed(1)}) and project or seminar courses (avg ${style.hands_on_average.toFixed(1)}).`}
              </p>
            </Section>
          )}
          {profile.completedCourses.length === 0 && (
            <p className="text-xs text-slate-400 leading-relaxed">Upload your transcript to see your strengths and gaps.</p>
          )}
        </div>
      )}
    </div>
  );
}
