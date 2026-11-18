// Mock of the backend Recommender and Explainer
// (see the architecture diagram in DB_WebApplication.pdf). It scores courses with
// simple rules so the UI can be built and tested; the real ranking and the LLM
// explanations will come from the FastAPI endpoints with the same output shape.

import { isHeavy } from '../lib/format';
import { coursesClash, slotsClash } from '../lib/schedule';

const TOPIC_LABELS = {
  llm: 'large language models',
  nlp: 'NLP',
  'deep learning': 'deep learning',
  'machine learning': 'machine learning',
  databases: 'databases',
  'data engineering': 'data engineering',
  cloud: 'cloud computing',
  'distributed systems': 'distributed systems',
  'computer vision': 'computer vision',
  probability: 'probability',
  security: 'security',
  cryptography: 'cryptography',
  'information retrieval': 'information retrieval',
  ethics: 'AI ethics',
};

// Extra words that should count as a mention of a topic.
const ALIASES = {
  llm: ['llm', 'llms', 'large language model', 'gpt', 'chatbot'],
  nlp: ['nlp', 'natural language', 'language model', 'text'],
  'deep learning': ['deep learning', 'neural network', 'neural net'],
  'machine learning': ['machine learning', ' ml ', 'ml,', 'ml.', 'artificial intelligence'],
  ai: [' ai ', ' ai,', ' ai.', 'artificial intelligence'],
  databases: ['database', 'databases', 'sql', 'dbms'],
  'data engineering': ['data engineering', 'data pipeline', 'etl', 'data platform'],
  cloud: ['cloud', 'aws', 'azure', 'kubernetes'],
  'distributed systems': ['distributed'],
  probability: ['probability', 'probabilistic', 'statistics', 'bayesian'],
  theory: ['theory', 'theoretical', 'math'],
  research: ['research', 'paper'],
  industry: ['industry', 'industrial', 'job market', 'career'],
  'computer vision': ['computer vision', 'image', 'vision'],
  security: ['security', 'privacy'],
  cryptography: ['crypto'],
  'information retrieval': ['retrieval', 'search engine', 'rag'],
  ethics: ['ethics', 'fairness', 'responsible'],
};

function mentions(text, topic) {
  const padded = ` ${text} `;
  return (ALIASES[topic] || [topic]).some((alias) => padded.includes(alias));
}

export function readPreferences(profile) {
  const text = (profile.interestText || '').toLowerCase();
  return {
    text,
    wantsProjects: /project|hands-on|practical/.test(text),
    dislikesExams: /dislike[^.]*exam|only slides|multiple-choice|no (written )?exam/.test(text),
    lowWorkload: /low workload|part-time|part time|job|not more than one[^.]*heavy/.test(text) || (profile.maxHoursPerWeek && profile.maxHoursPerWeek <= 30),
    english: /english/.test(text) || profile.languagePref === 'english',
    research: /research/.test(text),
    industry: /industry/.test(text),
    seminar: /seminar/.test(text),
  };
}

function avg(list) {
  return list.length ? list.reduce((s, x) => s + x, 0) / list.length : null;
}

function gradedCourses(profile) {
  return (profile.completedCourses || []).filter((c) => c.grade && !Number.isNaN(parseFloat(c.grade)));
}

// Average grade on project/seminar modules vs. written exams.
export function learningStyle(profile) {
  const graded = gradedCourses(profile);
  const hands = avg(graded.filter((c) => c.exam_style === 'project' || c.exam_style === 'seminar' || /practical|seminar|project/i.test(c.type || c.name)).map((c) => parseFloat(c.grade)));
  const written = avg(graded.filter((c) => c.exam_style === 'written').map((c) => parseFloat(c.grade)));
  if (hands == null || written == null) return null;
  return { hands, written, prefersHandsOn: written - hands >= 0.4 };
}

// Summary for the "What we understood so far" card.
export function profileInsights(profile) {
  const graded = gradedCourses(profile);
  const prefs = readPreferences(profile);
  const strong = graded.filter((c) => parseFloat(c.grade) <= 1.5).map((c) => c.name.replace(/^(Practical Course|Seminar):\s*/i, ''));
  const skills = (profile.skills || []).map((s) => s.name);
  const gaps = graded.filter((c) => parseFloat(c.grade) >= 2.7).map((c) => `${c.name.replace(/ for Informatics$/, '')} grade: ${c.grade}`);
  const completedText = (profile.completedCourses || []).map((c) => c.name.toLowerCase()).join(' | ');
  for (const topic of ['deep learning', 'machine learning', 'nlp', 'databases']) {
    if (mentions(prefs.text, topic) && !mentions(completedText, topic) && (profile.completedCourses || []).length > 0) {
      gaps.push(`No ${TOPIC_LABELS[topic]} module yet`);
    }
  }
  const interests = Object.keys(TOPIC_LABELS).filter((t) => mentions(prefs.text, t)).map((t) => TOPIC_LABELS[t]);
  const constraints = [];
  if (prefs.wantsProjects) constraints.push('Prefers project work');
  if (prefs.dislikesExams) constraints.push('Avoids exam-only courses');
  if (prefs.lowWorkload) constraints.push('Limited weekly time');
  if (prefs.english) constraints.push('Taught in English');
  if (prefs.research) constraints.push('Research-oriented');
  if (prefs.industry) constraints.push('Industry relevance');
  return {
    interests,
    constraints,
    strong: [...new Set([...strong, ...skills])].slice(0, 6),
    gaps: [...new Set(gaps)].slice(0, 4),
    style: learningStyle(profile),
  };
}

function checkPrerequisites(course, profile) {
  const completed = profile.completedCourses || [];
  const skills = (profile.skills || []).map((s) => s.name.toLowerCase());
  return course.prerequisites.map((p) => {
    const match = completed.find((c) => p.keywords.some((k) => c.name.toLowerCase().includes(k)));
    const skill = skills.find((s) => p.keywords.some((k) => s.includes(k)));
    if (match) {
      const grade = parseFloat(match.grade);
      if (!Number.isNaN(grade) && grade >= 2.7) {
        return { ...p, status: 'weak', detail: `Passed with ${match.grade}; worth refreshing before the course starts.` };
      }
      return { ...p, status: 'met', detail: match.grade ? `Passed, grade ${match.grade}${skill ? ', plus experience on your CV' : ''}` : 'Passed' };
    }
    if (skill) return { ...p, status: 'met', detail: 'Listed in your skills' };
    return { ...p, status: p.recommendedOnly ? 'recommended' : 'missing', detail: p.recommendedOnly ? `Recommended, not in your record. ${p.hint || ''}`.trim() : 'Required, not in your record.' };
  });
}

function addUnique(list, item) {
  if (!list.some((x) => x.title === item.title)) list.push(item);
}

// Scores one course for a profile and explains the result.
// `course` must already carry grade_summary and rating (see mock/index.js).
export function scoreCourse(course, profile) {
  const prefs = readPreferences(profile);
  const passRate = course.grade_summary.pass_rate;
  const style = learningStyle(profile);
  const hasInterests = prefs.text.trim().length > 0;
  const hasRecord = (profile.completedCourses || []).length > 0;

  // Interest overlap with the course's topics.
  const hits = [...new Set(course.topics.filter((t) => mentions(prefs.text, t)))];
  const namedHits = hits.filter((t) => TOPIC_LABELS[t]).map((t) => TOPIC_LABELS[t]);
  const interest = hasInterests ? Math.min(1, hits.length / 3) : 0.3;

  // Course format vs. stated and observed preferences.
  let format = 0.5;
  const handsOn = course.exam_style === 'project' || course.exam_style === 'seminar';
  if (prefs.wantsProjects && course.exam_style === 'project') format += 0.4;
  if (prefs.dislikesExams && course.exam_style === 'written') format -= 0.4;
  if (prefs.research && course.exam_style === 'seminar') format += 0.3;
  if (style?.prefersHandsOn && handsOn) format += 0.2;
  format = Math.max(0, Math.min(1, format));

  const prereqs = checkPrerequisites(course, profile);
  const missing = prereqs.filter((p) => p.status === 'missing');
  const weak = prereqs.filter((p) => p.status === 'weak' || p.status === 'recommended');
  const prereqScore = hasRecord ? Math.max(0, 1 - missing.length * 0.5 - weak.length * 0.15) : 0.6;

  let workload = 1;
  if (prefs.lowWorkload && isHeavy(course)) workload = 0.4;
  if (profile.maxHoursPerWeek && course.workload_hours_per_week > profile.maxHoursPerWeek / 2) workload -= 0.3;

  const rating = course.rating.average ?? 3;
  const ratingCount = course.rating.count;
  const quality = 0.6 * ((rating - 3) / 2) + 0.4 * (passRate ?? 0.8);

  // Fixed commitments (job, sports, ...) from the student's own calendar.
  const blocked = (profile.commitments || []).filter((c) => course.offering.schedule.some((s) => slotsClash(s, c)));

  let score = 0.45 * interest + 0.15 * format + 0.15 * prereqScore + 0.1 * Math.max(0, workload) + 0.15 * Math.max(0, quality);
  if (blocked.length) score -= 0.15;
  const match = Math.max(10, Math.min(99, Math.round(45 + 54 * score)));

  // Reasons, strongest first.
  const reasons = [];
  if (namedHits.length > 0) {
    addUnique(reasons, {
      title: 'It covers what you asked for',
      short: `Directly covers the ${namedHits.slice(0, 2).join(' and ')} topics you asked for${course.exam_style === 'project' ? ', applied in a team project' : ''}.`,
      text: `You mentioned ${namedHits.join(', ')}. ${course.module_description}`,
      sources: ['your interests', 'module description'],
    });
  }
  if (handsOn && style?.prefersHandsOn) {
    addUnique(reasons, {
      title: `Your record suggests ${course.exam_style === 'project' ? 'project-based' : 'seminar'} grading suits you`,
      short: `Your best grades are in project and seminar modules, and this one is graded by ${course.assessment_type.toLowerCase()}, not a written exam.`,
      text: `In your transcript, seminars and practical courses average ${style.hands.toFixed(1)}, while written exams average ${style.written.toFixed(1)}. This course is graded on ${course.assessment_type.toLowerCase()}, with no written exam.`,
      sources: ['your transcript', 'module description'],
    });
  } else if (prefs.wantsProjects && course.exam_style === 'project') {
    addUnique(reasons, {
      title: 'Hands-on, project-based format',
      short: `Graded on ${course.assessment_type.toLowerCase()}, matching your wish for practical work.`,
      text: `You asked for practical work. This course is graded on ${course.assessment_type.toLowerCase()} rather than a written exam.`,
      sources: ['your interests', 'module description'],
    });
  }
  const met = prereqs.filter((p) => p.status === 'met');
  if (hasRecord && met.length > 0 && prereqs.every((p) => p.status === 'met' || p.status === 'recommended')) {
    addUnique(reasons, {
      title: 'Your background covers the prerequisites',
      short: `Your ${met.map((p) => p.name.toLowerCase()).join(' and ')} background matches what the course expects.`,
      text: `The course expects ${course.prerequisites.map((p) => p.name.toLowerCase()).join(', ')}. ${met.map((p) => `${p.name}: ${p.detail.toLowerCase()}`).join('. ')}.`,
      sources: ['your transcript', ...((profile.skills || []).length ? ['your CV'] : [])],
    });
  }
  if (prefs.lowWorkload && course.workload_hours_per_week <= 6) {
    addUnique(reasons, {
      title: 'Light workload',
      short: `Around ${course.workload_hours_per_week} h per week, so it balances heavier courses.`,
      text: `Students report about ${course.workload_hours_per_week} hours per week, which leaves room next to a job or a heavier course.`,
      sources: ['student reviews'],
    });
  }
  if (prefs.research && course.exam_style === 'seminar') {
    addUnique(reasons, {
      title: 'Research-oriented format',
      short: 'Gives you a first taste of reading and presenting research papers.',
      text: `Graded on ${course.assessment_type.toLowerCase()}, so you practise reading, writing and presenting research.`,
      sources: ['your interests', 'module description'],
    });
  }
  if (rating >= 4.4) {
    addUnique(reasons, {
      title: 'Students rate it highly',
      short: `Rated ${rating.toFixed(1)} / 5 by ${ratingCount} students.`,
      text: `Past participants rate it ${rating.toFixed(1)} out of 5 across ${ratingCount} reviews: ${course.review_summary.positive}`,
      sources: ['student reviews'],
    });
  }
  if (reasons.length === 0) {
    reasons.push({
      title: 'Offered in your degree program this semester',
      short: `Counts towards ${course.degree_groups[0]} in your program.`,
      text: `${course.module_description}`,
      sources: ['module description'],
    });
  }

  // Cautions.
  const cautions = [];
  for (const b of blocked) {
    addUnique(cautions, { level: 'high', title: `Clashes with ${b.label}`, text: `A session overlaps with your ${b.label} on ${b.day} ${b.start}–${b.end}.` });
  }
  if (prefs.dislikesExams && course.exam_style === 'written') {
    addUnique(cautions, { level: 'high', title: 'Written exam only', text: 'The final exam is written only; this is the exam style you said you like least.' });
  }
  for (const p of missing) {
    addUnique(cautions, { level: 'high', title: `Missing prerequisite: ${p.name}`, text: `The course expects ${p.name.toLowerCase()}, which is not in your record yet.` });
  }
  for (const k of course.known_cautions) addUnique(cautions, k);
  for (const p of weak) {
    addUnique(cautions, {
      level: 'medium',
      title: p.status === 'weak' ? `Refresh ${p.name.toLowerCase()}` : `${p.name} recommended`,
      text: p.status === 'weak' ? `It leans on ${p.name.toLowerCase()}, where your grade was lower. ${p.detail}` : `Assumes ${p.name.toLowerCase()}, which is not in your record. ${p.hint || ''}`.trim(),
    });
  }
  if (passRate != null && passRate < 0.75) {
    addUnique(cautions, { level: 'medium', title: 'Lower pass rate', text: `Only ${Math.round(passRate * 100)}% of students passed in recent semesters.` });
  }
  if (prefs.lowWorkload && isHeavy(course)) {
    addUnique(cautions, { level: 'medium', title: 'Heavy workload', text: `About ${course.workload_hours_per_week} hours per week; avoid pairing it with another heavy course.` });
  }
  if (ratingCount < 30) {
    addUnique(cautions, { level: 'low', title: 'Few reviews', text: `Only ${ratingCount} reviews, so the statistics are less reliable.` });
  }
  if (course.language !== 'English' && !prefs.english) {
    addUnique(cautions, { level: 'low', title: `Taught in ${course.language}`, text: `Lectures and exam are in ${course.language}.` });
  }
  const order = { high: 0, medium: 1, low: 2 };
  cautions.sort((a, b) => order[a.level] - order[b.level]);

  return { course, match, score, reasons, cautions, prerequisites: prereqs, blocked_by: blocked.map((b) => b.label) };
}

export function passesConstraints(course, profile) {
  const prefs = readPreferences(profile);
  if ((profile.completedCourses || []).some((c) => c.id === course.course_id)) return false;
  if (prefs.english && course.language !== 'English') return false;
  if (profile.maxHoursPerWeek && course.workload_hours_per_week > profile.maxHoursPerWeek) return false;
  return true;
}

function shortName(name) {
  return name.replace(/^(Practical Course|Seminar):\s*/i, '').replace('Introduction to ', 'Intro to ');
}

// Picks a combination of non-clashing courses up to the ECTS target.
// -> Combination (see docs/frontend-api.md)
export function suggestCombination(ranked, profile) {
  const prefs = readPreferences(profile);
  const target = profile.targetEcts || 30;
  const maxHeavy = prefs.lowWorkload ? 1 : 2;
  const chosen = [];
  const skipped = [];
  for (const r of ranked) {
    const c = r.course;
    const ects = chosen.reduce((s, x) => s + x.course.ects, 0);
    const heavy = chosen.filter((x) => isHeavy(x.course)).length;
    const hours = chosen.reduce((s, x) => s + x.course.workload_hours_per_week, 0);
    if (r.blocked_by.length) continue;
    if (ects + c.ects > target) continue;
    if (profile.maxHoursPerWeek && hours + c.workload_hours_per_week > profile.maxHoursPerWeek) continue;
    const clash = chosen.find((x) => coursesClash(x.course, c));
    if (clash) {
      skipped.push(`${shortName(c.course_name)} clashes with ${shortName(clash.course.course_name)} and fits better next semester.`);
      continue;
    }
    if (isHeavy(c) && heavy >= maxHeavy) {
      skipped.push(`${shortName(c.course_name)} would add another heavy course and fits better next semester.`);
      continue;
    }
    if (r.match < 60) continue;
    chosen.push(r);
    if (chosen.length >= 4) break;
  }
  const ects = chosen.reduce((s, x) => s + x.course.ects, 0);
  const hours = chosen.reduce((s, x) => s + x.course.workload_hours_per_week, 0);
  const heavyCount = chosen.filter((x) => isHeavy(x.course)).length;
  const parts = [ects < target ? `${target - ects} ECTS under your target` : `Hits your ${target} ECTS target`];
  if (prefs.lowWorkload) parts.push(`only ${heavyCount === 1 ? 'one heavy course' : `${heavyCount} heavy courses`}, which leaves room for your other commitments`);
  return {
    title: chosen.map((x) => shortName(x.course.course_name)).join(' + '),
    course_ids: chosen.map((x) => x.course.course_id),
    ects,
    target_ects: target,
    hours_per_week: hours,
    clashes: 0,
    note: `${parts.join(' and ')}.${skipped.length ? ` ${skipped[0]}` : ''}`,
  };
}

// -> RecommendationResponse (see docs/frontend-api.md)
export function recommend(courses, profile) {
  const eligible = courses.filter((c) => passesConstraints(c, profile));
  const ranked = eligible.map((c) => scoreCourse(c, profile)).sort((a, b) => b.score - a.score);
  const insights = profileInsights(profile);
  // Prefer a strength that relates to what the student asked for.
  const relevantStrength =
    insights.strong.find((s) => insights.interests.some((i) => s.toLowerCase().includes(i.toLowerCase().slice(0, 6)))) || insights.strong[0];
  const focus = insights.interests.length ? `your interest in ${insights.interests.slice(0, 2).join(' and ')}` : 'your profile';
  const extras = [
    relevantStrength ? `your strong ${relevantStrength.toLowerCase()} background` : null,
    insights.constraints.includes('Prefers project work') ? 'your preference for project work over exam-only courses' : null,
  ].filter(Boolean);
  return {
    total_offered: courses.length,
    passed_constraints: eligible.length,
    summary: `Ranked for ${focus}${extras.length ? `, ${extras.join(', and ')}` : ''}.`,
    results: ranked.map(({ score: _score, ...rest }) => rest),
    combination: suggestCombination(ranked, profile),
  };
}
