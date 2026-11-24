import { Check, ChevronRight, Plus } from 'lucide-react';
import { Link } from '../lib/router';
import { formatGrade, formatPercent } from '../lib/format';
import { formatSchedule } from '../lib/schedule';
import { CautionItem, MatchBadge, StatTile, Tag } from './ui';
import { useAppState } from '../state/AppState';

export default function RecommendationCard({ rank, result, clashWith }) {
  const { course, match, reasons, cautions, blocked_by: blockedBy } = result;
  const { grade_summary: grades, rating } = course;
  const clashLabel = blockedBy[0] ? `your ${blockedBy[0]}` : clashWith;
  const { plan, togglePlan } = useAppState();
  const planned = plan.includes(course.course_id);

  return (
    <article className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center shrink-0">{rank}</span>
          <div className="min-w-0">
            <Link to={`/courses/${course.course_id}`} className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight hover:text-blue-700 transition">
              {course.course_name}
            </Link>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Tag>{course.ects} ECTS</Tag>
              <Tag>{course.course_type}</Tag>
              <Tag>{course.language}</Tag>
              {clashLabel ? (
                <Tag tone="amber">Clashes with {clashLabel}</Tag>
              ) : (
                <Tag>{formatSchedule(course.offering.schedule)}</Tag>
              )}
            </div>
          </div>
        </div>
        <div className="self-start sm:self-auto ml-10 sm:ml-0">
          <MatchBadge match={match} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mt-5">
        <StatTile label="Pass rate" value={formatPercent(grades.pass_rate)} />
        <StatTile label="Average grade" value={formatGrade(grades.average_grade)} />
        <StatTile label="Workload" value={`~${course.workload_hours_per_week} h / week`} />
        <StatTile label="Student rating" value={rating.average == null ? '—' : `${rating.average.toFixed(1)} / 5`} sub={`${rating.count} reviews`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="rounded-xl bg-emerald-50/70 p-4">
          <h3 className="text-xs font-semibold text-emerald-800 mb-2">Why it fits you</h3>
          <ul className="space-y-2">
            {reasons.slice(0, 2).map((r) => (
              <li key={r.title} className="flex gap-2 text-xs text-slate-700 leading-relaxed">
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                <span>{r.short}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-amber-50/70 p-4">
          <h3 className="text-xs font-semibold text-amber-800 mb-2">Be cautious of</h3>
          {cautions.length ? (
            <ul className="space-y-2">
              {cautions.slice(0, 2).map((c) => (
                <CautionItem key={c.title} caution={c} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-600">Nothing stands out for your profile.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-500 leading-relaxed">Students say: {course.review_summary.oneLiner}</p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => togglePlan(course.course_id)}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              planned ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {planned ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {planned ? 'In plan' : 'Add to plan'}
          </button>
          <Link
            to={`/courses/${course.course_id}`}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl border border-blue-600 text-blue-700 text-xs font-semibold hover:bg-blue-50 transition"
          >
            View full analysis <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
