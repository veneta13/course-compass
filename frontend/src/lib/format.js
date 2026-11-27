// Display helpers. No business logic: numbers come from the API.

// Order and labels of GradeSummary.bands, matching the grade_distribution_bands view.
export const GRADE_BANDS = [
  { key: 'very_good', label: '1.0–1.5' },
  { key: 'good', label: '1.6–2.5' },
  { key: 'satisfactory', label: '2.6–3.5' },
  { key: 'sufficient', label: '3.6–4.0' },
  { key: 'failed', label: 'Failed' },
];

export function formatGrade(g) {
  return g == null ? '—' : Number(g).toFixed(1);
}

export function formatPercent(p) {
  return p == null ? '—' : `${Math.round(p * 100)}%`;
}

export function formatRating(r) {
  return r?.average == null ? '—' : `${r.average.toFixed(1)} / 5`;
}

// 'WS2024' -> 'Winter 2024/25', 'SS2025' -> 'Summer 2025'
export function formatSemester(code) {
  if (!code) return '';
  const year = Number(code.slice(2));
  return code.startsWith('WS') ? `Winter ${year}/${String(year + 1).slice(2)}` : `Summer ${year}`;
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// 'Practical Course: Large Language Models' -> 'Large Language Models'
export function shortCourseName(name) {
  return name.replace(/^(Practical Course|Seminar):\s*/i, '').replace('Introduction to ', 'Intro to ');
}

export function isHeavy(course) {
  return course.workload_hours_per_week >= 12;
}

// Fields the real database often doesn't have yet (ECTS, workload, times).
export function ectsLabel(ects) {
  return ects == null ? null : `${ects} ECTS`;
}

export function hoursLabel(hours, suffix = ' h / week') {
  return hours == null ? '—' : `~${hours}${suffix}`;
}

export function sumOf(list, key) {
  return list.reduce((s, x) => s + (Number(x[key]) || 0), 0);
}
