// Mock versions of what the backend computes from the database. The bands and
// averages follow the grade_distribution_bands view in schema.sql.

const BAND_TESTS = {
  very_good: (g) => g <= 1.5,
  good: (g) => g > 1.5 && g <= 2.5,
  satisfactory: (g) => g > 2.5 && g <= 3.5,
  sufficient: (g) => g > 3.5 && g <= 4.0,
  failed: (g) => g > 4.0,
};

// -> GradeSummary (see docs/frontend-api.md)
export function gradeSummary(distributions = []) {
  const bands = Object.fromEntries(Object.keys(BAND_TESTS).map((k) => [k, 0]));
  let total = 0;
  let gradeSum = 0;
  for (const d of distributions) {
    for (const [gradeStr, count] of Object.entries(d.grade_counts || {})) {
      const g = Number(gradeStr);
      const key = Object.keys(BAND_TESTS).find((k) => BAND_TESTS[k](g));
      bands[key] += count;
      total += count;
      gradeSum += g * count;
    }
  }
  return {
    bands,
    total_students: total,
    semester_count: new Set(distributions.map((d) => d.semester)).size,
    average_grade: total ? Math.round((gradeSum / total) * 100) / 100 : null,
    pass_rate: total ? (total - bands.failed) / total : null,
  };
}

// Imported rating summary plus ratings submitted in the app. -> RatingSummary
export function ratingSummary(reviewStats, userReviews = []) {
  const count = reviewStats.count + userReviews.length;
  const sum = reviewStats.average * reviewStats.count + userReviews.reduce((s, r) => s + r.rating, 0);
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : null };
}
