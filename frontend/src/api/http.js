// Real implementation: calls the FastAPI backend at API_URL.
import { API_URL } from '../config';
import { ENDPOINTS } from './endpoints';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function call(endpoint, args = [], body) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${API_URL}${endpoint.path(...args)}`, {
    method: endpoint.method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (!res.ok) {
    // FastAPI puts error messages in `detail` (a string, or a list for 422s).
    let message = res.statusText;
    try {
      const data = await res.json();
      message = typeof data.detail === 'string' ? data.detail : data.detail?.[0]?.msg || message;
    } catch {
      // Not JSON; keep the status text.
    }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? null : res.json();
}

export const httpApi = {
  listCourses: () => call(ENDPOINTS.listCourses),
  getCourse: (courseId) => call(ENDPOINTS.getCourse, [courseId]),
  getRecommendations: (profilePayload) => call(ENDPOINTS.getRecommendations, [], { profile: profilePayload }),
  getCourseMatch: (courseId, profilePayload) => call(ENDPOINTS.getCourseMatch, [courseId], { profile: profilePayload }),
  getProfileInsights: (profilePayload) => call(ENDPOINTS.getProfileInsights, [], { profile: profilePayload }),
  uploadDocument: (file) => {
    const form = new FormData();
    form.append('file', file);
    return call(ENDPOINTS.uploadDocument, [], form);
  },
  submitReview: (courseId, review) => call(ENDPOINTS.submitReview, [courseId], review),
  uploadGradeDistribution: (courseId, { file, semester, exam_type }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('semester', semester);
    form.append('exam_type', exam_type);
    return call(ENDPOINTS.uploadGradeDistribution, [courseId], form);
  },
};
