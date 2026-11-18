// App-wide state: the student profile (interests, documents, completed courses,
// skills, preferences) and the semester plan. Persisted in localStorage until the
// backend stores profiles.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, demoState } from '../api/client';
import { storage } from '../lib/storage';

// Demo and normal runs keep separate saved state, so demo data never leaks into real use.
const PREFIX = demoState ? 'cc.demo' : 'cc';
const PROFILE_KEY = `${PREFIX}.profile.v2`;
const PLAN_KEY = `${PREFIX}.plan.v2`;

// An empty profile. Names and degree come from the student; nothing is invented.
export const EMPTY_PROFILE = {
  firstName: '',
  lastName: '',
  email: '',
  degreeProgram: 'M.Sc. Informatics',
  faculty: '',
  currentSemester: 1,
  targetGraduation: '',
  degreeEcts: 120,
  specialization: '',
  preferredLanguage: 'English & German',
  timeCommitment: 'Full-time Study (0h external work)',
  // Recommendation inputs
  interestText: '',
  targetEcts: 30,
  maxHoursPerWeek: null,
  languagePref: 'any',
  files: [],
  completedCourses: [],
  skills: [],
  // Fixed weekly commitments (job, sports, ...): { id, label, day, start, end }
  commitments: [],
};

const INITIAL_PROFILE = demoState ? { ...EMPTY_PROFILE, ...demoState.profile } : EMPTY_PROFILE;
const INITIAL_PLAN = demoState ? demoState.plan : [];

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [profile, setProfile] = useState(() => {
    const saved = storage.get(PROFILE_KEY, {});
    // Files still "processing" when the page closed never finished; drop them.
    const files = (saved.files || []).filter((f) => f.status === 'processed');
    return { ...INITIAL_PROFILE, ...saved, files };
  });
  const [plan, setPlan] = useState(() => storage.get(PLAN_KEY, INITIAL_PLAN));

  useEffect(() => storage.set(PROFILE_KEY, profile), [profile]);
  useEffect(() => storage.set(PLAN_KEY, plan), [plan]);

  const updateProfile = useCallback((patch) => {
    setProfile((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  }, []);

  // Uploads a transcript or CV and merges what the parser read into the profile.
  const addDocument = useCallback(async (file) => {
    const id = `${file.name}-${file.size}-${Date.now()}`;
    setProfile((p) => ({ ...p, files: [...p.files, { id, name: file.name, size: file.size, status: 'processing' }] }));
    try {
      const result = await api.uploadDocument(file);
      setProfile((p) => {
        const known = new Set(p.completedCourses.map((c) => c.id));
        const modules = result.modules
          .filter((m) => !known.has(m.module_id))
          .map((m) => ({
            id: m.module_id,
            name: m.name,
            ects: m.ects,
            grade: m.grade == null ? '' : Number(m.grade).toFixed(1),
            semester: m.semester,
            type: m.course_type,
            exam_style: m.exam_style,
            source: id,
          }));
        const knownSkills = new Set(p.skills.map((s) => s.name.toLowerCase()));
        const skills = result.skills.filter((s) => !knownSkills.has(s.toLowerCase())).map((name) => ({ name, source: id }));
        const ects = result.modules.reduce((s, m) => s + m.ects, 0);
        const description =
          result.kind === 'cv'
            ? `CV · ${result.skills.length} skills found`
            : `Read ${result.modules.length} modules · ${ects} ECTS · grades included`;
        return {
          ...p,
          completedCourses: [...p.completedCourses, ...modules],
          skills: [...p.skills, ...skills],
          files: p.files.map((f) => (f.id === id ? { ...f, status: 'processed', kind: result.kind, description } : f)),
        };
      });
    } catch (err) {
      setProfile((p) => ({ ...p, files: p.files.map((f) => (f.id === id ? { ...f, status: 'error', description: err.message } : f)) }));
    }
  }, []);

  // Removing a document also removes what was imported from it.
  const removeDocument = useCallback((id) => {
    setProfile((p) => ({
      ...p,
      files: p.files.filter((f) => f.id !== id),
      completedCourses: p.completedCourses.filter((c) => c.source !== id),
      skills: p.skills.filter((s) => s.source !== id),
    }));
  }, []);

  const addCommitment = useCallback((c) => {
    setProfile((p) => ({ ...p, commitments: [...p.commitments, { ...c, id: `c-${Date.now()}` }] }));
  }, []);

  const removeCommitment = useCallback((cid) => {
    setProfile((p) => ({ ...p, commitments: p.commitments.filter((c) => c.id !== cid) }));
  }, []);

  const togglePlan = useCallback((courseId) => {
    setPlan((prev) => (prev.includes(courseId) ? prev.filter((x) => x !== courseId) : [...prev, courseId]));
  }, []);

  // Demo only: start over with the prepared profile.
  const resetDemo = useCallback(() => {
    setProfile(INITIAL_PROFILE);
    setPlan(INITIAL_PLAN);
  }, []);

  const value = useMemo(
    () => ({ resetDemo, profile, updateProfile, addDocument, removeDocument, addCommitment, removeCommitment, plan, setPlan, togglePlan }),
    [resetDemo, profile, updateProfile, addDocument, removeDocument, addCommitment, removeCommitment, plan, togglePlan],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
