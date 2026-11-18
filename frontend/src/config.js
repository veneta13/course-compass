// Frontend configuration.
//
// Two modes:
//   npm run dev   -> talks to the FastAPI backend at API_URL. No invented data.
//   npm run demo  -> VITE_DEMO=true (see .env.demo): uses the fixtures and mock
//                    backend in src/demo with a ready-made student profile.

export const DEMO = import.meta.env.VITE_DEMO === 'true';

// Base URL of the backend. The default '/api' goes through the Vite dev proxy
// (vite.config.js), so there are no CORS issues in development.
export const API_URL = import.meta.env.VITE_API_URL || '/api';

// Values the backend will eventually own (current semester, degree) live here
// until there is an endpoint for them.
export const CURRENT_SEMESTER = {
  year: 2026,
  semester: 'WS2026',
  label: 'Winter semester 2026/27',
  short: 'Winter 2026/27',
  // Lecture period, used for the calendar export.
  lecturesStart: '2026-10-19',
  lecturesEnd: '2027-02-12',
};

export const DEGREE = { degree_id: 'MSC-INF', degree_name: 'M.Sc. Informatics' };
