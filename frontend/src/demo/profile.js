// The student the demo starts with: the example from the project pitch, with a
// transcript already read and a part-time job in the calendar.
import { SAMPLE_TRANSCRIPT, SAMPLE_CV_SKILLS } from './fixtures';

const TRANSCRIPT_ID = 'demo-transcript';
const CV_ID = 'demo-cv';

export const DEMO_PROFILE = {
  firstName: 'Lena',
  lastName: 'Maier',
  email: 'lena.maier@tum.de',
  degreeProgram: 'M.Sc. Informatics',
  faculty: 'TUM School of Computation, Information and Technology',
  currentSemester: 1,
  targetGraduation: 'Winter 2027/28',
  degreeEcts: 120,
  specialization: 'Machine Learning and Analytics',
  preferredLanguage: 'English & German',
  timeCommitment: 'Working Student (15-20h / week)',
  interestText:
    'I want to go deeper into NLP and how large language models work, ideally with a practical project. I enjoy probability and theory but dislike courses that are only slides and a multiple-choice exam. Not more than one very heavy course alongside a part-time job.',
  targetEcts: 24,
  maxHoursPerWeek: 35,
  languagePref: 'any',
  files: [
    { id: TRANSCRIPT_ID, name: 'Transcript_BSc_Informatics.pdf', size: 184320, status: 'processed', kind: 'transcript', description: `Read ${SAMPLE_TRANSCRIPT.length} modules · ${SAMPLE_TRANSCRIPT.reduce((s, m) => s + m.ects, 0)} ECTS · grades included` },
    { id: CV_ID, name: 'CV_Lena_Maier.pdf', size: 96256, status: 'processed', kind: 'cv', description: `CV · ${SAMPLE_CV_SKILLS.length} skills found` },
  ],
  completedCourses: SAMPLE_TRANSCRIPT.map((m) => ({ ...m, source: TRANSCRIPT_ID })),
  skills: SAMPLE_CV_SKILLS.map((name) => ({ name, source: CV_ID })),
  commitments: [{ id: 'demo-job', label: 'Part-time job', day: 'Fri', start: '09:00', end: '17:00' }],
};

export const DEMO_PLAN = [];
