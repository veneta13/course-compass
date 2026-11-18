// Demo backend, loaded only when VITE_DEMO=true (npm run demo). It implements
// the same functions as src/api/http.js and returns exactly the shapes in
// docs/frontend-api.md, backed by the fixtures in this folder. Contributions
// (reviews, grade uploads) are kept in localStorage.
import { COURSES, SEED_REVIEWS, SAMPLE_TRANSCRIPT, SAMPLE_CV_SKILLS } from './fixtures';
import { gradeSummary, ratingSummary } from './stats';
import { profileInsights, recommend, scoreCourse } from './recommender';
import { storage } from '../lib/storage';

const CONTRIB_KEY = 'cc.demo.contributions.v1';
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

class MockError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function contributions() {
  return storage.get(CONTRIB_KEY, { reviews: [], gradeUploads: [] });
}

function saveContributions(c) {
  storage.set(CONTRIB_KEY, c);
}

function findRaw(courseId) {
  const course = COURSES.find((c) => c.course_id === courseId);
  if (!course) throw new MockError(404, 'Course not found');
  return course;
}

// Raw mock course + derived numbers, as the recommender needs it.
function enrich(raw) {
  const userReviews = contributions().reviews.filter((r) => r.course_id === raw.course_id);
  return { ...raw, grade_summary: gradeSummary(raw.distributions), rating: ratingSummary(raw.review_stats, userReviews) };
}

// -> CourseSummary
function toSummary(c) {
  return {
    course_id: c.course_id,
    course_name: c.course_name,
    ects: c.ects,
    course_type: c.course_type,
    language: c.language,
    assessment_type: c.assessment_type,
    exam_style: c.exam_style,
    workload_hours_per_week: c.workload_hours_per_week,
    module_description: c.module_description,
    topics: c.topics,
    degree_groups: c.degree_groups,
    offering: c.offering,
    grade_summary: c.grade_summary,
    rating: c.rating,
    review_summary: c.review_summary,
  };
}

// -> CourseDetail
function toDetail(c) {
  const userReviews = contributions().reviews.filter((r) => r.course_id === c.course_id);
  const reviews = [...userReviews, ...SEED_REVIEWS.filter((r) => r.course_id === c.course_id)].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    ...toSummary(c),
    prerequisites: c.prerequisites.map((p) => ({ name: p.name, recommended_only: !!p.recommendedOnly })),
    team_size: c.team_size || null,
    applications_close: c.applications_close || null,
    weekly_workload: c.weekly_workload,
    distributions: c.distributions.map(({ semester, year, exam_type, grade_counts, grade5x }) => ({ semester, year, exam_type, grade_counts, grade5x })),
    reviews,
  };
}

// -> Recommendation
function toRecommendation(r) {
  return {
    course: toSummary(r.course),
    match: r.match,
    reasons: r.reasons,
    cautions: r.cautions,
    prerequisites: r.prerequisites.map(({ name, status, detail }) => ({ name, status, detail })),
    blocked_by: r.blocked_by,
  };
}

// ProfilePayload -> the recommender's internal profile shape.
function fromPayload(p) {
  return {
    interestText: p.interest_text,
    targetEcts: p.target_ects,
    maxHoursPerWeek: p.max_hours_per_week,
    languagePref: p.language_pref,
    completedCourses: p.completed_courses.map((c) => ({
      id: c.module_id,
      name: c.name,
      ects: c.ects,
      grade: c.grade == null ? '' : c.grade.toFixed(1),
      semester: c.semester,
      type: c.course_type,
      exam_style: c.exam_style,
    })),
    skills: p.skills.map((name) => ({ name })),
    commitments: p.commitments,
  };
}

export const mockApi = {
  async listCourses() {
    await delay(150);
    return COURSES.map(enrich).map(toSummary);
  },

  async getCourse(courseId) {
    await delay(150);
    return toDetail(enrich(findRaw(courseId)));
  },

  async getRecommendations(payload) {
    await delay(500);
    const res = recommend(COURSES.map(enrich), fromPayload(payload));
    return { ...res, results: res.results.map(toRecommendation) };
  },

  async getCourseMatch(courseId, payload) {
    await delay(150);
    const r = scoreCourse(enrich(findRaw(courseId)), fromPayload(payload));
    return toRecommendation(r);
  },

  async getProfileInsights(payload) {
    await delay(100);
    const i = profileInsights(fromPayload(payload));
    return {
      interests: i.interests,
      constraints: i.constraints,
      strong: i.strong,
      gaps: i.gaps,
      learning_style: i.style ? { hands_on_average: i.style.hands, written_average: i.style.written, prefers_hands_on: i.style.prefersHandsOn } : null,
    };
  },

  async uploadDocument(file) {
    await delay(1200);
    // Files with "cv" or "resume" in the name are read as a CV, everything else as a transcript.
    if (/\b(cv|resume|lebenslauf)\b/i.test(file.name.replace(/[_.-]/g, ' '))) {
      return { kind: 'cv', modules: [], skills: SAMPLE_CV_SKILLS };
    }
    return {
      kind: 'transcript',
      modules: SAMPLE_TRANSCRIPT.map((m) => ({ module_id: m.id, name: m.name, ects: m.ects, grade: Number(m.grade), semester: m.semester, course_type: m.type, exam_style: m.exam_style })),
      skills: [],
    };
  },

  async submitReview(courseId, review) {
    await delay();
    findRaw(courseId);
    if (!(review.rating >= 1 && review.rating <= 5)) throw new MockError(422, 'Rating must be between 1 and 5.');
    const c = contributions();
    const saved = { ...review, review_id: Date.now(), course_id: courseId, created_at: new Date().toISOString().slice(0, 10) };
    c.reviews.push(saved);
    saveContributions(c);
    return saved;
  },

  async uploadGradeDistribution(courseId, { file, semester, exam_type }) {
    await delay(600);
    findRaw(courseId);
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new MockError(422, 'Please upload a PNG, JPG or WEBP image.');
    const c = contributions();
    const upload = {
      upload_id: Date.now(),
      course_id: courseId,
      file_name: file.name,
      semester,
      exam_type,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    c.gradeUploads.push(upload);
    saveContributions(c);
    return upload;
  },
};
