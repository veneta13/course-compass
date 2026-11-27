import { useState } from 'react';
import { AlertTriangle, Check, CircleDashed, Minus, Plus, X } from 'lucide-react';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { useAppState } from '../state/AppState';
import { ectsLabel, formatDate, formatSemester, shortCourseName as shortName, sumOf } from '../lib/format';
import { coursesClash, formatSchedule, slotsClash } from '../lib/schedule';
import { CURRENT_SEMESTER, DEGREE } from '../config';
import { BackLink, Card, CautionItem, ErrorBox, Loading, MatchBadge, Stars, Tag } from '../components/ui';
import { GradeDistributionChart, WorkloadChart } from '../components/charts';
import { GradeDistributionForm, ReviewForm } from '../components/ContributeForms';

const PREREQ_ICON = {
  met: { Icon: Check, cls: 'text-emerald-600' },
  weak: { Icon: AlertTriangle, cls: 'text-amber-600' },
  recommended: { Icon: AlertTriangle, cls: 'text-amber-600' },
  missing: { Icon: X, cls: 'text-rose-600' },
};

export default function CourseDetailPage({ courseId }) {
  const { profile, plan, togglePlan } = useAppState();
  const { data: course, error, loading, reload } = useAsync(() => api.getCourse(courseId), [courseId]);
  const [tab, setTab] = useState('review');
  const [showAllReviews, setShowAllReviews] = useState(false);

  const hasProfile = profile.interestText.trim().length > 0 || profile.completedCourses.length > 0;
  const matchKey = JSON.stringify([courseId, profile.interestText, profile.completedCourses, profile.skills, profile.commitments, profile.maxHoursPerWeek, profile.languagePref]);
  const { data: result } = useAsync(() => (hasProfile ? api.getCourseMatch(courseId, profile) : Promise.resolve(null)), [matchKey]);
  // Needed for "Fits your semester": the other courses in the plan.
  const { data: allCourses } = useAsync(() => api.listCourses(), []);

  if (loading && !course) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const stats = course.grade_summary;
  const rating = course.rating;
  const reasons = result?.reasons || [];
  const cautions = result?.cautions || [];
  const match = result?.match;
  const prerequisites = result?.prerequisites || course.prerequisites.map((p) => ({ name: p.name, status: null, detail: p.recommended_only ? 'Recommended' : 'Expected' }));
  const planned = plan.includes(course.course_id);

  // How the course fits with what is already in the plan.
  const others = (allCourses || []).filter((c) => plan.includes(c.course_id) && c.course_id !== course.course_id);
  const clashes = [
    ...others.filter((c) => coursesClash(c, course)),
    ...profile.commitments.filter((m) => (course.offering.schedule || []).some((s) => slotsClash(s, m))).map((m) => ({ course_name: `your ${m.label}` })),
  ];
  const totalEcts = sumOf(others, 'ects') + (Number(course.ects) || 0);
  const hasTimes = course.offering.schedule?.length > 0;
  const ectsNote = course.ects == null ? " This course's ECTS aren't in TUMonline yet, so the total may be low." : '';
  const fitText =
    (others.length
      ? `Together with ${others.map((c) => shortName(c.course_name)).join(' and ')}, ${
          clashes.length
            ? `it clashes with ${clashes.map((c) => shortName(c.course_name)).join(' and ')}`
            : hasTimes
              ? 'there are no timetable clashes'
              : "we can't check for clashes yet (no lecture times published)"
        } and you land at ${totalEcts} ECTS${totalEcts > profile.targetEcts ? `, above your ${profile.targetEcts} ECTS target` : ''}.`
      : `Your plan is empty. Adding it puts you at ${totalEcts} of your ${profile.targetEcts} ECTS target.`) + ectsNote;

  const reviews = course.reviews;
  const shownReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  const facts = [
    ['Schedule', formatSchedule(course.offering.schedule)],
    course.offering.room && ['Room', course.offering.room],
    course.offering.lecturer && ['Lecturer', course.offering.lecturer.replace(/; /g, ', ')],
    course.assessment_type && ['Assessment', course.assessment_type],
    course.ects != null && ['Credits', ectsLabel(course.ects)],
    course.team_size && ['Team size', course.team_size],
    course.applications_close && ['Applications close', formatDate(course.applications_close)],
    ['Counts towards', course.degree_groups?.length ? `${course.degree_groups.join(', ')} (${DEGREE.degree_name})` : DEGREE.degree_name],
    ['Module', course.module_code || course.course_id],
  ].filter(Boolean);

  const planButton = (variant) => (
    <button
      type="button"
      onClick={() => togglePlan(course.course_id)}
      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${
        variant === 'dark'
          ? planned
            ? 'bg-slate-800 text-white border border-slate-600 hover:bg-slate-700'
            : 'bg-white text-slate-900 hover:bg-slate-100'
          : planned
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {planned ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      {planned ? 'Remove from my plan' : 'Add to my plan'}
    </button>
  );

  return (
    <div className="pb-20 lg:pb-0">
      <BackLink to={hasProfile ? '/matches' : '/courses'}>{hasProfile ? 'Back to recommendations' : 'Back to catalog'}</BackLink>

      <div className="flex flex-wrap gap-1.5 mt-4">
        {course.ects != null && <Tag>{ectsLabel(course.ects)}</Tag>}
        {course.course_type && <Tag>{course.course_type}</Tag>}
        {course.language && <Tag>{course.language}</Tag>}
        <Tag tone="blue">Offered in {CURRENT_SEMESTER.short.toLowerCase()}</Tag>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mt-3">
        <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">{course.course_name}</h1>
        {hasProfile && match != null && <MatchBadge match={match} size="lg" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
        <div className="lg:col-span-8 space-y-6 min-w-0">
          <Card>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight mb-4">{hasProfile ? 'Why we recommend it' : 'About this course'}</h2>
            {hasProfile && reasons.length > 0 ? (
              <div className="space-y-4">
                {reasons.map((r) => (
                  <div key={r.title} className="border-l-[3px] border-emerald-600 pl-4">
                    <h3 className="text-sm font-semibold text-slate-900">{r.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">{r.text}</p>
                    <p className="text-[11px] font-semibold text-blue-700 mt-1">Source: {r.sources.join(' · ')}</p>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{course.module_description || 'TUMonline has no description for this course yet.'}</p>
                <p className="text-xs text-slate-500 mt-4">
                  <a href="#/" className="text-blue-700 font-semibold underline">Tell us about your interests</a> to see how well this course fits you.
                </p>
              </>
            )}
          </Card>

          {cautions.length > 0 && (
            <Card>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight mb-4">What to be cautious of</h2>
              <div className="space-y-3">
                {cautions.map((c) => (
                  <CautionItem key={c.title} caution={c} detailed />
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h2 className="text-base font-bold text-slate-900">Grade distribution</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-5">
                Last {stats.semester_count} semester{stats.semester_count === 1 ? '' : 's'} · {stats.total_students} students
              </p>
              <GradeDistributionChart summary={stats} />
            </Card>
            <Card>
              <h2 className="text-base font-bold text-slate-900">Workload by week</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-5">Hours per week, as reported by students</p>
              <WorkloadChart weeks={course.weekly_workload} />
            </Card>
          </div>

          <Card>
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-4">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">What students say</h2>
              <span className="text-xs text-slate-500 flex items-center gap-2">
                {rating.count > 0 ? (
                  <>
                    <Stars value={rating.average ?? 0} size="w-3.5 h-3.5" /> {rating.average?.toFixed(1)} / 5 from {rating.count} rating{rating.count === 1 ? '' : 's'}
                  </>
                ) : (
                  'No ratings yet'
                )}
              </span>
            </div>
            {course.review_summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-xs font-semibold text-emerald-700 mb-1.5">Mentioned most as positive</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{course.review_summary.positive}</p>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-amber-800 mb-1.5">Mentioned most as negative</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{course.review_summary.negative}</p>
                </div>
              </div>
            )}
            {!course.review_summary && reviews.length === 0 && (
              <p className="text-sm text-slate-500">
                No reviews yet.{' '}
                <a href="#contribute" className="text-blue-700 font-semibold hover:underline">
                  Be the first to share your experience.
                </a>
              </p>
            )}

            {reviews.length > 0 && (
              <div className={course.review_summary ? 'mt-6 pt-5 border-t border-slate-100' : ''}>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent reviews</h3>
                <ul className="space-y-4">
                  {shownReviews.map((r) => (
                    <li key={r.review_id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        {r.rating != null && <Stars value={r.rating} size="w-3.5 h-3.5" />}
                        <span>{formatSemester(r.semester)}</span>
                        {r.workload_hours ? <span>· ~{r.workload_hours} h / week</span> : null}
                      </div>
                      <p className="text-slate-700 mt-1 leading-relaxed">{r.review_text}</p>
                    </li>
                  ))}
                </ul>
                {reviews.length > 3 && (
                  <button type="button" onClick={() => setShowAllReviews((v) => !v)} className="mt-4 text-xs font-semibold text-blue-700 hover:underline cursor-pointer">
                    {showAllReviews ? 'Show fewer' : `Show all ${reviews.length} written reviews`}
                  </button>
                )}
              </div>
            )}
            {course.review_summary && (
              <p className="text-[11px] text-slate-400 mt-5 pt-4 border-t border-slate-100">
                Opinions are paraphrased and weighted towards recent semesters. Sentiment is a summary, not an endorsement.
              </p>
            )}
          </Card>

          <Card id="contribute">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Took this course? Help the next students</h2>
            <p className="text-xs text-slate-500 mt-1 mb-4">Your rating, experience and exam results feed directly into the statistics above.</p>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/60 mb-5 w-full sm:w-auto">
              {[
                ['review', 'Leave a review'],
                ['grades', 'Share exam results'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    tab === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === 'review' ? <ReviewForm courseId={course.course_id} onSubmitted={reload} /> : <GradeDistributionForm courseId={course.course_id} />}
          </Card>
        </div>

        <aside className="lg:col-span-4 space-y-6 min-w-0">
          <div className="bg-[#0f172a] text-white rounded-2xl p-6 shadow-lg">
            <h2 className="text-base font-bold">Fits your semester</h2>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">{fitText}</p>
            {clashes.length > 0 && <p className="text-xs text-amber-300 mt-2">Check the timetable on your plan before registering.</p>}
            <div className="mt-4">{planButton('dark')}</div>
          </div>

          {prerequisites.length === 0 && course.prerequisites_text && (
            <Card>
              <h2 className="text-base font-bold text-slate-900 mb-2">Recommended background</h2>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{course.prerequisites_text}</p>
            </Card>
          )}

          {prerequisites.length > 0 && (
            <Card>
              <h2 className="text-base font-bold text-slate-900 mb-4">Prerequisites check</h2>
              <ul className="space-y-3.5">
                {prerequisites.map((p) => {
                  const { Icon, cls } = p.status ? PREREQ_ICON[p.status] : { Icon: CircleDashed, cls: 'text-slate-400' };
                  return (
                    <li key={p.name} className="flex gap-2.5">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cls}`} />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500 leading-relaxed">{p.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="text-base font-bold text-slate-900 mb-2">Course facts</h2>
            <dl className="divide-y divide-slate-100">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5 text-xs">
                  <dt className="text-slate-500 shrink-0">{k}</dt>
                  <dd className="font-semibold text-slate-900 text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[11px] text-slate-500 leading-relaxed">
            Statistics come from previous semesters and may change. Always confirm dates and requirements in TUMonline before registering.
          </div>
        </aside>
      </div>

      {/* Mobile: keep the main action within reach. */}
      <div className="lg:hidden fixed bottom-14 md:bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3">{planButton('light')}</div>
    </div>
  );
}
