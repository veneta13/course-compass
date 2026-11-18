import { useMemo, useState } from 'react';
import { Check, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { useAppState } from '../state/AppState';
import { Link } from '../lib/router';
import { formatGrade, formatPercent } from '../lib/format';
import { formatSchedule } from '../lib/schedule';
import { CURRENT_SEMESTER, DEGREE } from '../config';
import { ErrorBox, Loading, Tag } from '../components/ui';

const selectCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

const DEFAULT_FILTERS = { type: 'all', language: 'all', group: 'all', maxHours: 'all', ects: 'all', sort: 'name' };

export default function CatalogPage() {
  const { profile, plan, togglePlan } = useAppState();
  const { data: courses, error, loading, reload } = useAsync(() => api.listCourses(), []);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const hasProfile = profile.interestText.trim().length > 0 || profile.completedCourses.length > 0;

  // Match scores come from the recommender; the catalog itself works without a profile.
  const matchKey = JSON.stringify([hasProfile, profile.interestText, profile.completedCourses, profile.skills, profile.commitments]);
  const { data: recs } = useAsync(() => (hasProfile ? api.getRecommendations(profile) : Promise.resolve(null)), [matchKey]);
  const scored = useMemo(() => {
    const matches = Object.fromEntries((recs?.results || []).map((r) => [r.course.course_id, r.match]));
    return (courses || []).map((course) => ({ course, match: matches[course.course_id] ?? null }));
  }, [courses, recs]);

  const options = useMemo(() => {
    const list = courses || [];
    return {
      types: [...new Set(list.map((c) => c.course_type))].sort(),
      languages: [...new Set(list.map((c) => c.language))].sort(),
      groups: [...new Set(list.flatMap((c) => c.degree_groups))].sort(),
    };
  }, [courses]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = scored.filter(({ course: c }) => {
      if (q && !`${c.course_name} ${c.course_id} ${c.module_description} ${(c.topics || []).join(' ')} ${c.offering.lecturer || ''}`.toLowerCase().includes(q)) return false;
      if (filters.type !== 'all' && c.course_type !== filters.type) return false;
      if (filters.language !== 'all' && c.language !== filters.language) return false;
      if (filters.group !== 'all' && !c.degree_groups.includes(filters.group)) return false;
      if (filters.maxHours !== 'all' && c.workload_hours_per_week > Number(filters.maxHours)) return false;
      if (filters.ects === 'small' && c.ects > 5) return false;
      if (filters.ects === 'medium' && (c.ects < 6 || c.ects > 8)) return false;
      if (filters.ects === 'large' && c.ects < 9) return false;
      return true;
    });
    const sorters = {
      name: (a, b) => a.course.course_name.localeCompare(b.course.course_name),
      match: (a, b) => (b.match ?? -1) - (a.match ?? -1),
      rating: (a, b) => (b.course.rating.average ?? 0) - (a.course.rating.average ?? 0),
      workload: (a, b) => a.course.workload_hours_per_week - b.course.workload_hours_per_week,
      passRate: (a, b) => (b.course.grade_summary.pass_rate ?? 0) - (a.course.grade_summary.pass_rate ?? 0),
    };
    return [...list].sort(sorters[filters.sort]);
  }, [scored, query, filters]);

  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== 'sort' && v !== 'all').length;
  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div>
      <div className="text-xs font-bold text-blue-700 tracking-wider uppercase">{DEGREE.degree_name} · {CURRENT_SEMESTER.short}</div>
      <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-2">Course catalog</h1>
      <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-3xl">
        Every module offered in your program this semester, with past statistics and student ratings.
      </p>

      <div className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, module ID, topic or lecturer"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="lg:hidden inline-flex items-center gap-1.5 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 cursor-pointer"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>

      <div className={`${showFilters ? 'grid' : 'hidden'} lg:grid grid-cols-2 lg:grid-cols-6 gap-3 mt-3 p-4 lg:p-0 rounded-xl bg-white lg:bg-transparent border border-slate-200 lg:border-0`}>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Type</span>
          <select value={filters.type} onChange={set('type')} className={selectCls}>
            <option value="all">All types</option>
            {options.types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Language</span>
          <select value={filters.language} onChange={set('language')} className={selectCls}>
            <option value="all">Any language</option>
            {options.languages.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Module area</span>
          <select value={filters.group} onChange={set('group')} className={selectCls}>
            <option value="all">All areas</option>
            {options.groups.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">ECTS</span>
          <select value={filters.ects} onChange={set('ects')} className={selectCls}>
            <option value="all">Any</option>
            <option value="small">Up to 5</option>
            <option value="medium">6 to 8</option>
            <option value="large">9 or more</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Workload</span>
          <select value={filters.maxHours} onChange={set('maxHours')} className={selectCls}>
            <option value="all">Any</option>
            <option value="6">Up to 6 h / week</option>
            <option value="10">Up to 10 h / week</option>
            <option value="13">Up to 13 h / week</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Sort by</span>
          <select value={filters.sort} onChange={set('sort')} className={selectCls}>
            <option value="name">Name</option>
            {hasProfile && <option value="match">Best match</option>}
            <option value="rating">Best rated</option>
            <option value="passRate">Highest pass rate</option>
            <option value="workload">Lowest workload</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between mt-5 text-xs text-slate-500">
        <span>
          {results.length} of {scored.length} courses
        </span>
        {(activeFilters > 0 || query) && (
          <button
            type="button"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setQuery('');
            }}
            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        {results.length === 0 && <p className="md:col-span-2 text-sm text-slate-500 py-12 text-center">No courses match your search.</p>}
        {results.map(({ course: c, match }) => {
          const planned = plan.includes(c.course_id);
          return (
            <article key={c.course_id} className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col hover:border-slate-300 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono font-semibold text-blue-700">{c.course_id}</div>
                  <Link to={`/courses/${c.course_id}`} className="block text-base font-bold text-slate-900 tracking-tight mt-0.5 hover:text-blue-700 transition">
                    {c.course_name}
                  </Link>
                </div>
                {match != null && (
                  <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-lg ${match >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{match}%</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <Tag>{c.ects} ECTS</Tag>
                <Tag>{c.course_type}</Tag>
                <Tag>{c.language}</Tag>
              </div>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed line-clamp-2">{c.module_description}</p>
              <dl className="grid grid-cols-4 gap-2 mt-4 mb-4 text-center">
                {[
                  ['Pass rate', formatPercent(c.grade_summary.pass_rate)],
                  ['Avg grade', formatGrade(c.grade_summary.average_grade)],
                  ['Workload', `${c.workload_hours_per_week} h`],
                  ['Rating', c.rating.average == null ? '—' : `${c.rating.average.toFixed(1)} (${c.rating.count})`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-slate-50 rounded-lg py-2 px-1 min-w-0">
                    <dt className="text-[10px] text-slate-500">{k}</dt>
                    <dd className="text-xs font-bold text-slate-900 truncate">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-auto">
                <span className="text-[11px] text-slate-500 truncate">{formatSchedule(c.offering.schedule)}</span>
                <button
                  type="button"
                  onClick={() => togglePlan(c.course_id)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    planned ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {planned ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {planned ? 'In plan' : 'Plan'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
