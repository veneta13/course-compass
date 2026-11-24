import { useState } from 'react';
import { AlertTriangle, CalendarDays, Download, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { useAppState } from '../state/AppState';
import { Link } from '../lib/router';
import { ALL_DAYS, DAYS, findClashes, formatSchedule, toMinutes } from '../lib/schedule';
import { downloadIcs } from '../lib/calendar';
import { CURRENT_SEMESTER } from '../config';
import { Card, ErrorBox, Loading, Tag } from '../components/ui';

const START = 8 * 60;
const END = 20 * 60;
const HOUR_PX = 44;

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

// Builds the blocks shown in the timetable: course sessions and commitments.
function toBlocks(courses, commitments) {
  return [
    ...courses.flatMap((c) =>
      c.offering.schedule.map((s) => ({ key: `${c.course_id}-${s.day}-${s.start}`, id: c.course_id, kind: 'course', title: c.course_name, link: `/courses/${c.course_id}`, ...s })),
    ),
    ...commitments.map((m) => ({ key: m.id, id: m.id, kind: 'commitment', title: m.label, day: m.day, start: m.start, end: m.end })),
  ];
}

function blockColor(b, clashingIds) {
  if (clashingIds.has(b.id)) return 'bg-amber-700 text-white';
  return b.kind === 'commitment' ? 'bg-slate-500 text-white' : 'bg-blue-700 text-white';
}

function Timetable({ blocks, clashingIds }) {
  // Show the weekend only when a commitment falls on it.
  const days = blocks.some((b) => b.day === 'Sat' || b.day === 'Sun') ? ALL_DAYS : DAYS;
  const height = ((END - START) / 60) * HOUR_PX;
  return (
    <>
      <div className="hidden md:grid text-xs" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d} className="text-center font-semibold text-slate-500 pb-2">
            {d}
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {Array.from({ length: (END - START) / 60 + 1 }, (_, i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-slate-400" style={{ top: i * HOUR_PX }}>
              {8 + i}:00
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className="relative border-l border-slate-100" style={{ height }}>
            {Array.from({ length: (END - START) / 60 }, (_, i) => (
              <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * HOUR_PX }} />
            ))}
            {blocks
              .filter((b) => b.day === d)
              .map((b) => {
                const top = ((Math.max(toMinutes(b.start), START) - START) / 60) * HOUR_PX;
                const bottom = ((Math.min(toMinutes(b.end), END) - START) / 60) * HOUR_PX;
                const body = (
                  <>
                    <div className="font-semibold text-[11px] leading-tight line-clamp-2">{b.title}</div>
                    <div className="text-[10px] opacity-80">
                      {b.start}–{b.end}
                    </div>
                  </>
                );
                const cls = `absolute inset-x-1 rounded-lg px-2 py-1 overflow-hidden border-2 border-white ${blockColor(b, clashingIds)}`;
                const style = { top, height: Math.max(18, bottom - top) };
                return b.link ? (
                  <Link key={b.key} to={b.link} className={`${cls} hover:opacity-90`} style={style} title={`${b.title} · ${b.start}–${b.end}`}>
                    {body}
                  </Link>
                ) : (
                  <div key={b.key} className={cls} style={style} title={`${b.title} · ${b.start}–${b.end}`}>
                    {body}
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      {/* Mobile: day list */}
      <div className="md:hidden space-y-4">
        {ALL_DAYS.map((d) => {
          const dayBlocks = blocks.filter((b) => b.day === d).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
          if (!dayBlocks.length) return null;
          return (
            <div key={d}>
              <div className="text-xs font-semibold text-slate-500 mb-1.5">{d}</div>
              <ul className="space-y-1.5">
                {dayBlocks.map((b) => {
                  const tone = clashingIds.has(b.id) ? 'bg-amber-50 border-amber-200' : b.kind === 'commitment' ? 'bg-slate-100 border-slate-200' : 'bg-blue-50 border-blue-100';
                  const inner = (
                    <>
                      <span className="font-mono font-semibold text-slate-700 shrink-0">
                        {b.start}–{b.end}
                      </span>
                      <span className="font-semibold text-slate-900 truncate">{b.title}</span>
                    </>
                  );
                  return (
                    <li key={b.key}>
                      {b.link ? (
                        <Link to={b.link} className={`flex gap-3 items-center rounded-lg px-3 py-2 text-xs border ${tone}`}>
                          {inner}
                        </Link>
                      ) : (
                        <div className={`flex gap-3 items-center rounded-lg px-3 py-2 text-xs border ${tone}`}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CommitmentsCard() {
  const { profile, addCommitment, removeCommitment } = useAppState();
  const empty = { label: '', day: 'Mon', start: '09:00', end: '13:00' };
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const valid = form.label.trim() && toMinutes(form.end) > toMinutes(form.start);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    addCommitment({ ...form, label: form.label.trim() });
    setForm(empty);
    setOpen(false);
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Your fixed commitments</h2>
          <p className="text-xs text-slate-500 mt-0.5">Job, sports or other weekly slots. Recommendations avoid courses that clash with them.</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/80 text-xs font-semibold hover:bg-blue-100 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">What is it?</span>
            <input autoFocus value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Part-time job" className={inputCls} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Day</span>
              <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className={inputCls}>
                {ALL_DAYS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">From</span>
              <input type="time" step="900" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">To</span>
              <input type="time" step="900" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={inputCls} />
            </label>
          </div>
          {form.label && !valid && <p className="text-xs text-rose-600">The end time must be after the start time.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/60 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={!valid} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 cursor-pointer">
              Save
            </button>
          </div>
        </form>
      )}

      {profile.commitments.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {profile.commitments.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{m.label}</div>
                <div className="text-[11px] text-slate-500">
                  {m.day} {m.start}–{m.end}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeCommitment(m.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                aria-label={`Remove ${m.label}`}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !open && <p className="text-xs text-slate-400 italic mt-4">No commitments yet.</p>
      )}
    </Card>
  );
}

export default function PlanPage() {
  const { profile, plan, togglePlan } = useAppState();
  const { data: courses, error, loading, reload } = useAsync(() => api.listCourses(), []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const planned = courses.filter((c) => plan.includes(c.course_id));
  const ects = planned.reduce((s, c) => s + c.ects, 0);
  const hours = planned.reduce((s, c) => s + c.workload_hours_per_week, 0);
  const clashes = findClashes(planned, profile.commitments);
  const clashingIds = new Set(clashes.flatMap((c) => c.ids));
  const ectsPct = Math.min(100, Math.round((ects / profile.targetEcts) * 100));
  const blocks = toBlocks(planned, profile.commitments);

  return (
    <div>
      <div className="text-xs font-bold text-blue-700 tracking-wider uppercase">{CURRENT_SEMESTER.label}</div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-2">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">My semester plan</h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-3xl">Collect the courses you are considering, add your fixed commitments, and check credits, workload and clashes at a glance.</p>
        </div>
        <button
          type="button"
          disabled={blocks.length === 0}
          onClick={() => downloadIcs(planned, profile.commitments)}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
          title="Download an .ics file for Google Calendar, Outlook or Apple Calendar"
        >
          <Download className="w-4 h-4" />
          Export to calendar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        <Card padding="p-5">
          <div className="text-xs text-slate-500">Credits</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            {ects} <span className="text-sm font-semibold text-slate-400">/ {profile.targetEcts} ECTS</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
            <div className={`h-full rounded-full ${ects > profile.targetEcts ? 'bg-amber-600' : 'bg-blue-600'}`} style={{ width: `${ectsPct}%` }} />
          </div>
        </Card>
        <Card padding="p-5">
          <div className="text-xs text-slate-500">Expected workload</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            ~{hours} <span className="text-sm font-semibold text-slate-400">h / week</span>
          </div>
          {profile.maxHoursPerWeek && hours > profile.maxHoursPerWeek ? <p className="text-xs text-amber-700 mt-2">Above your limit of {profile.maxHoursPerWeek} h.</p> : null}
        </Card>
        <Card padding="p-5">
          <div className="text-xs text-slate-500">Timetable clashes</div>
          <div className={`text-2xl font-extrabold mt-1 ${clashes.length ? 'text-amber-700' : 'text-slate-900'}`}>{clashes.length}</div>
        </Card>
      </div>

      {clashes.length > 0 && (
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-1">
          {clashes.map((c) => (
            <p key={c.ids.join('-')} className="flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <span>
                <strong>{c.a}</strong> clashes with <strong>{c.b}</strong>.
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
        <div className="lg:col-span-5 space-y-6 min-w-0">
          <Card className="overflow-hidden" padding="p-0">
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-base font-bold text-slate-900">Planned courses</h2>
            </div>
            {planned.length === 0 ? (
              <div className="px-5 pb-6 pt-2 text-center">
                <CalendarDays className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-500 mt-2">No courses yet.</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
                  <Link to="/matches" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
                    See recommendations
                  </Link>
                  <Link to="/courses" className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
                    Browse catalog
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {planned.map((c) => (
                  <li key={c.course_id} className="px-5 py-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/courses/${c.course_id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                        {c.course_name}
                      </Link>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <Tag>{c.ects} ECTS</Tag>
                        <Tag>~{c.workload_hours_per_week} h</Tag>
                        {clashingIds.has(c.course_id) && <Tag tone="amber">Clash</Tag>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1.5">{formatSchedule(c.offering.schedule)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePlan(c.course_id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      aria-label={`Remove ${c.course_name} from plan`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <CommitmentsCard />
        </div>
        <Card className="lg:col-span-7 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold text-slate-900">Weekly timetable</h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-700" /> Course
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" /> Commitment
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-700" /> Clash
              </span>
            </div>
          </div>
          {blocks.length ? <Timetable blocks={blocks} clashingIds={clashingIds} /> : <p className="text-sm text-slate-400 py-10 text-center">Add courses or commitments to see your week.</p>}
          <p className="text-[11px] text-slate-400 mt-4">
            The export repeats every session weekly from {CURRENT_SEMESTER.lecturesStart} to {CURRENT_SEMESTER.lecturesEnd}. Import the file into Google Calendar, Outlook or Apple Calendar.
          </p>
        </Card>
      </div>
    </div>
  );
}
