// Converts the profile kept in the UI (camelCase, with UI-only fields) into the
// ProfilePayload the backend receives (snake_case, see docs/frontend-api.md).
export function toProfilePayload(profile) {
  return {
    interest_text: profile.interestText || '',
    target_ects: profile.targetEcts ?? null,
    max_hours_per_week: profile.maxHoursPerWeek ?? null,
    language_pref: profile.languagePref || 'any',
    completed_courses: (profile.completedCourses || []).map((c) => ({
      module_id: c.id,
      name: c.name,
      ects: Number(c.ects) || 0,
      grade: c.grade ? Number(c.grade) : null,
      semester: c.semester || null,
      course_type: c.type || null,
      exam_style: c.exam_style || null,
    })),
    skills: (profile.skills || []).map((s) => s.name),
    commitments: (profile.commitments || []).map(({ label, day, start, end }) => ({ label, day, start, end })),
  };
}
