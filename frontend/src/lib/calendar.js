// Calendar export: builds an iCalendar (.ics) file with one weekly recurring
// event per course session and commitment over the lecture period. Google
// Calendar, Outlook and Apple Calendar can all import it.
import { CURRENT_SEMESTER } from '../config';
import { ALL_DAYS } from './schedule';

const ICS_DAYS = { Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA', Sun: 'SU' };

function pad(n) {
  return String(n).padStart(2, '0');
}

// First date on or after `startIso` that falls on `day`, as YYYYMMDD.
function firstDate(startIso, day) {
  const d = new Date(`${startIso}T00:00:00`);
  const target = (ALL_DAYS.indexOf(day) + 1) % 7; // JS: Sunday = 0
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function escape(text = '') {
  return text.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

function event({ uid, title, location, description, slot }) {
  const date = firstDate(CURRENT_SEMESTER.lecturesStart, slot.day);
  const until = CURRENT_SEMESTER.lecturesEnd.replace(/-/g, '') + 'T235959';
  const time = (t) => t.replace(':', '') + '00';
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@course-compass`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Berlin:${date}T${time(slot.start)}`,
    `DTEND;TZID=Europe/Berlin:${date}T${time(slot.end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[slot.day]};UNTIL=${until}`,
    `SUMMARY:${escape(title)}`,
    location ? `LOCATION:${escape(location)}` : null,
    description ? `DESCRIPTION:${escape(description)}` : null,
    'END:VEVENT',
  ].filter(Boolean);
}

export function buildIcs(courses, commitments = []) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Course Compass//Semester plan//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${CURRENT_SEMESTER.short}`];
  for (const c of courses) {
    c.offering.schedule.forEach((slot, i) => {
      lines.push(...event({ uid: `${c.course_id}-${i}`, title: c.course_name, location: c.offering.room, description: `${c.course_id} · ${c.ects} ECTS · ${c.offering.lecturer || ''}`, slot }));
    });
  }
  for (const m of commitments) {
    lines.push(...event({ uid: `commitment-${m.id}`, title: m.label, slot: m }));
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(courses, commitments) {
  const blob = new Blob([buildIcs(courses, commitments)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `course-compass-${CURRENT_SEMESTER.semester}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
