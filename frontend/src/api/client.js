// The one module pages import for data. Normal runs call the FastAPI backend
// (src/api/http.js). Demo runs (VITE_DEMO=true) load src/demo instead, which
// exposes the same functions with the same shapes (docs/frontend-api.md).
// The demo is imported dynamically, so it is not part of a normal build.
//
// Pages pass the UI profile; it is converted to the backend's ProfilePayload here.
import { httpApi } from './http';
import { toProfilePayload } from './payload';

// The flag is read inline so a normal build drops the demo code entirely.
const demo = import.meta.env.VITE_DEMO === 'true' ? await import('../demo') : null;
const impl = demo ? demo.api : httpApi;

export const api = {
  listCourses: () => impl.listCourses(),
  getCourse: (courseId) => impl.getCourse(courseId),
  getRecommendations: (profile) => impl.getRecommendations(toProfilePayload(profile)),
  getCourseMatch: (courseId, profile) => impl.getCourseMatch(courseId, toProfilePayload(profile)),
  getProfileInsights: (profile) => impl.getProfileInsights(toProfilePayload(profile)),
  uploadDocument: (file) => impl.uploadDocument(file),
  submitReview: (courseId, review) => impl.submitReview(courseId, review),
  uploadGradeDistribution: (courseId, upload) => impl.uploadGradeDistribution(courseId, upload),
};

// Starting state for demo mode; null in normal runs.
export const demoState = demo ? { profile: demo.DEMO_PROFILE, plan: demo.DEMO_PLAN } : null;
