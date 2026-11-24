import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { useAppState } from '../state/AppState';
import { BackLink, ErrorBox, Loading } from '../components/ui';
import RecommendationCard from '../components/RecommendationCard';
import { coursesClash } from '../lib/schedule';
import { shortCourseName } from '../lib/format';

const SORTS = [
  { key: 'match', label: 'Best match' },
  { key: 'workload', label: 'Lowest workload' },
  { key: 'rating', label: 'Best rated' },
  { key: 'project', label: 'Project-based only' },
];

export default function MatchesPage() {
  const { profile, plan, setPlan } = useAppState();
  const [sort, setSort] = useState('match');
  // Ask again only when an input that drives recommendations changes.
  const inputsKey = JSON.stringify([profile.interestText, profile.completedCourses, profile.skills, profile.targetEcts, profile.maxHoursPerWeek, profile.languagePref, profile.commitments]);
  const { data, error, loading, reload } = useAsync(() => api.getRecommendations(profile), [inputsKey]);

  const visible = useMemo(() => {
    if (!data) return [];
    let list = data.results.filter((r) => r.match >= 55);
    if (sort === 'workload') list = [...list].sort((a, b) => a.course.workload_hours_per_week - b.course.workload_hours_per_week);
    if (sort === 'rating') list = [...list].sort((a, b) => (b.course.rating.average ?? 0) - (a.course.rating.average ?? 0));
    if (sort === 'project') list = list.filter((r) => r.course.exam_style === 'project');
    return list.slice(0, 8);
  }, [data, sort]);

  if (loading && !data) return <Loading label="Matching courses to your profile…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const combo = data.combination;
  const comboCourses = combo.course_ids.map((id) => data.results.find((r) => r.course.course_id === id).course);
  const comboInPlan = combo.course_ids.length > 0 && combo.course_ids.every((id) => plan.includes(id));
  const addCombo = () => setPlan((p) => [...new Set([...p, ...combo.course_ids])]);

  return (
    <div>
      <BackLink to="/">Edit your profile</BackLink>
      <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-2">
        {visible.length} course{visible.length === 1 ? '' : 's'} worth your time this semester
      </h1>
      <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-3xl leading-relaxed">
        {data.summary} Out of {data.total_offered} courses offered this semester, {data.passed_constraints} passed your constraints.
      </p>

      {combo.course_ids.length > 0 && (
        <section className="mt-6 bg-[#0f172a] text-white rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5 justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">Suggested combination</div>
            <div className="text-base sm:text-lg font-bold mt-1">
              {combo.title} · {combo.ects} ECTS
            </div>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed max-w-2xl">{combo.note}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 shrink-0">
            <div className="flex gap-8">
              <div>
                <div className="text-2xl font-extrabold">~{combo.hours_per_week} h</div>
                <div className="text-[11px] text-slate-400">expected per week</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold">{combo.clashes}</div>
                <div className="text-[11px] text-slate-400">timetable clashes</div>
              </div>
            </div>
            <button
              type="button"
              disabled={comboInPlan}
              onClick={addCombo}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {comboInPlan ? 'In your plan' : 'Add all to plan'}
            </button>
          </div>
        </section>
      )}

      <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        <span className="text-xs text-slate-500 mr-1 shrink-0">Show</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
              sort === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 sm:space-y-5 mt-4">
        {visible.length === 0 && <p className="text-sm text-slate-500 py-10 text-center">No courses match this filter. Try another view or relax your constraints.</p>}
        {visible.map((r, i) => {
          // Flag a clash with a course from the suggested combination.
          const clash = !combo.course_ids.includes(r.course.course_id) && comboCourses.find((c) => coursesClash(c, r.course));
          return <RecommendationCard key={r.course.course_id} rank={i + 1} result={r} clashWith={clash ? `${shortCourseName(clash.course_name)} lecture` : null} />;
        })}
      </div>
    </div>
  );
}
