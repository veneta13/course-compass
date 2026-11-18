// Everything demo mode needs, loaded lazily by src/api/client.js so normal
// builds never touch invented data.
export { mockApi as api } from './mockApi';
export { DEMO_PROFILE, DEMO_PLAN } from './profile';
