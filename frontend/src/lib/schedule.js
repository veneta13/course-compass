// Timetable helpers. Slots look like { day: 'Tue', start: '14:00', end: '18:00' }.
// Commitments (the student's own calendar) use the same shape plus id and label.

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function slotsClash(a, b) {
  return a.day === b.day && toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

export function coursesClash(a, b) {
  return (a.offering.schedule || []).some((sa) => (b.offering.schedule || []).some((sb) => slotsClash(sa, sb)));
}

// Every clash in a plan: course vs. course and course vs. commitment.
// -> [{ a: label, b: label, ids: [course_id...] }]
export function findClashes(courses, commitments = []) {
  const clashes = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      if (coursesClash(courses[i], courses[j])) {
        clashes.push({ a: courses[i].course_name, b: courses[j].course_name, ids: [courses[i].course_id, courses[j].course_id] });
      }
    }
    for (const c of commitments) {
      if ((courses[i].offering.schedule || []).some((s) => slotsClash(s, c))) {
        clashes.push({ a: courses[i].course_name, b: `your ${c.label} (${c.day} ${c.start}–${c.end})`, ids: [courses[i].course_id, c.id] });
      }
    }
  }
  return clashes;
}

export function formatSchedule(schedule = []) {
  if (!schedule?.length) return 'Times not published yet';
  return schedule.map((s) => `${s.day} ${s.start}–${s.end}`).join(' · ');
}
