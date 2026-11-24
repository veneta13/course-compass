// Every backend route the frontend calls, in one place. The request and response
// shapes are documented in docs/frontend-api.md; keep both in sync with FastAPI.
import { CURRENT_SEMESTER, DEGREE } from '../config';

const id = (x) => encodeURIComponent(x);

export const ENDPOINTS = {
  listCourses: { method: 'GET', path: () => `/courses?semester=${CURRENT_SEMESTER.semester}&degree_id=${DEGREE.degree_id}` },
  getCourse: { method: 'GET', path: (courseId) => `/courses/${id(courseId)}` },
  getRecommendations: { method: 'POST', path: () => '/recommendations' },
  getCourseMatch: { method: 'POST', path: (courseId) => `/courses/${id(courseId)}/match` },
  getProfileInsights: { method: 'POST', path: () => '/profile/insights' },
  uploadDocument: { method: 'POST', path: () => '/profile/documents' },
  submitReview: { method: 'POST', path: (courseId) => `/courses/${id(courseId)}/reviews` },
  uploadGradeDistribution: { method: 'POST', path: (courseId) => `/courses/${id(courseId)}/grade-distributions/uploads` },
};
