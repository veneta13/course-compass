// Demo fixtures, loaded only in demo mode (VITE_DEMO=true). Field names follow
// src/course_compass/schema.sql (courses, course_offerings, grade_distributions,
// grade_counts, reviews).
//
// Everything here is invented for demos and UI development. Course codes and
// numbers are placeholders, not real TUM data.

// Builds grade_counts for one exam from band shares, so the mock stays short.
// shares = [very_good, good, satisfactory, sufficient, failed] in percent.
function dist(semester, examType, students, shares, grade5x = 0) {
  const bands = [[1.0, 1.3], [1.7, 2.0, 2.3], [2.7, 3.0, 3.3], [3.7, 4.0], [5.0]];
  const counts = {};
  bands.forEach((grades, i) => {
    const total = Math.round((students * shares[i]) / 100);
    grades.forEach((g, j) => {
      const share = Math.floor(total / grades.length) + (j < total % grades.length ? 1 : 0);
      if (share > 0) counts[g.toFixed(1)] = share;
    });
  });
  const year = Number(semester.slice(2));
  return { semester, year, exam_type: examType, grade5x, ungraded_passed: 0, ungraded_failed: 0, grade_counts: counts };
}

// Weekly workload curve: base hours with an optional peak at the end.
function curve(base, peakFrom = null, peak = null) {
  return Array.from({ length: 14 }, (_, i) => {
    const wobble = [0, 1, 1, 0, 1, 1, 2, 1, 0, 1, 2, 1, 1, 0][i];
    if (peakFrom && i + 1 >= peakFrom) return peak[i + 1 - peakFrom] ?? peak[peak.length - 1];
    return Math.max(1, base - 2 + wobble + Math.round(i / 6));
  });
}

export const COURSES = [
  {
    course_id: 'IN2106-LLM',
    course_name: 'Practical Course: Large Language Models in Practice',
    ects: 10,
    course_type: 'Practical course',
    language: 'English',
    assessment_type: 'Project, talk, report',
    exam_style: 'project',
    workload_hours_per_week: 14,
    module_description:
      'Teams of three to four students build an application around a large language model. Topics include fine-tuning, prompt design, retrieval-augmented generation and evaluation. The course runs as a team project of about eight weeks after a short lecture block.',
    topics: ['llm', 'large language models', 'nlp', 'language models', 'fine-tuning', 'transformers', 'machine learning', 'deep learning', 'project', 'industry'],
    prerequisites: [
      { name: 'Probability & statistics', keywords: ['probability', 'statistics', 'stochastics'] },
      { name: 'Programming in Python', keywords: ['python', 'programming'] },
      { name: 'Neural network basics', keywords: ['deep learning', 'neural', 'machine learning'], recommendedOnly: true, hint: 'A free online primer in the first two weeks will cover it.' },
    ],
    offering: { schedule: [{ day: 'Tue', start: '14:00', end: '18:00' }], room: '01.11.018', lecturer: 'Prof. Dr. A. Weber' },
    team_size: '3 to 4 students',
    applications_close: '2026-10-19',
    selection: true,
    degree_groups: ['Practical course'],
    weekly_workload: curve(12, 11, [18, 21, 24, 20]),
    distributions: [
      dist('WS2023', 'endterm', 48, [40, 40, 12, 2, 6]),
      dist('SS2024', 'endterm', 52, [37, 42, 13, 2, 6]),
      dist('WS2024', 'endterm', 55, [38, 41, 12, 1, 8]),
      dist('SS2025', 'endterm', 57, [37, 41, 11, 3, 8]),
    ],
    review_stats: { count: 58, average: 4.6 },
    review_summary: {
      positive: 'Real, modern tooling and a well-organised course team. Many say the project was the most useful thing they did in their master\'s.',
      negative: 'Compute access can be slow near deadlines, and the grading criteria for the final report are not very precise.',
      oneLiner: 'well organised and very rewarding, but plan for a heavy final stretch.',
    },
    known_cautions: [
      { level: 'high', title: 'Uneven workload', text: 'The weekly effort roughly doubles in the last month; reviewers report 20+ hours per week near the deadline.' },
      { level: 'medium', title: 'Selection process', text: 'Places are limited and assigned after a short motivation letter. Applications close on 19 October.' },
      { level: 'low', title: 'Teammates matter', text: 'Reviewers say the experience depends strongly on the team you are placed in.' },
    ],
  },
  {
    course_id: 'IN2361',
    course_name: 'Natural Language Processing',
    ects: 6,
    course_type: 'Lecture + exercise',
    language: 'English',
    assessment_type: 'Written exam (90 min)',
    exam_style: 'written',
    workload_hours_per_week: 9,
    module_description:
      'Foundations of natural language processing: tokenisation, language modelling, word embeddings, sequence models, transformers, and evaluation of NLP systems. Weekly exercise sheets apply the methods in Python.',
    topics: ['nlp', 'natural language processing', 'language models', 'llm', 'transformers', 'probability', 'machine learning', 'theory'],
    prerequisites: [
      { name: 'Probability & statistics', keywords: ['probability', 'statistics', 'stochastics'] },
      { name: 'Linear algebra', keywords: ['linear algebra'] },
      { name: 'Neural network basics', keywords: ['deep learning', 'neural', 'machine learning'], recommendedOnly: true, hint: 'Reviewers say the first weeks feel fast without them.' },
    ],
    offering: { schedule: [{ day: 'Mon', start: '10:00', end: '12:00' }, { day: 'Thu', start: '12:00', end: '14:00' }], room: 'MI HS 1', lecturer: 'Prof. Dr. L. Brandt' },
    degree_groups: ['Machine Learning and Analytics'],
    weekly_workload: curve(9, 13, [12, 14]),
    distributions: [
      dist('WS2023', 'endterm', 180, [16, 34, 25, 8, 17], 22),
      dist('WS2023', 'retake', 40, [8, 30, 30, 12, 20], 6),
      dist('WS2024', 'endterm', 196, [18, 35, 23, 7, 17], 25),
    ],
    review_stats: { count: 112, average: 4.3 },
    review_summary: {
      positive: 'Clear lectures with good slides and a fair exam that matches the exercises.',
      negative: 'Exercise sheets take longer than the credits suggest, and the pace picks up quickly after the first weeks.',
      oneLiner: 'clear lectures and fair exam, but the exercise sheets take longer than the credits suggest.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2107-PML',
    course_name: 'Seminar: Probabilistic Models for Language',
    ects: 5,
    course_type: 'Seminar',
    language: 'English',
    assessment_type: 'Paper and talk',
    exam_style: 'seminar',
    workload_hours_per_week: 6,
    module_description:
      'Each participant reads recent research on probabilistic approaches to language (topic models, Bayesian sequence models, uncertainty in language models), writes a short paper and gives a talk.',
    topics: ['probability', 'nlp', 'language models', 'research', 'theory', 'seminar', 'statistics', 'bayesian'],
    prerequisites: [{ name: 'Probability & statistics', keywords: ['probability', 'statistics', 'stochastics'] }],
    offering: { schedule: [{ day: 'Wed', start: '16:00', end: '18:00' }], room: '02.09.023', lecturer: 'Dr. M. Keller' },
    degree_groups: ['Seminar'],
    weekly_workload: curve(5, 9, [8, 10, 6, 5, 4, 3]),
    distributions: [dist('WS2023', 'endterm', 12, [60, 34, 3, 0, 3]), dist('WS2024', 'endterm', 12, [58, 39, 0, 0, 3])],
    review_stats: { count: 24, average: 4.1 },
    review_summary: {
      positive: 'Relaxed atmosphere and detailed feedback on the talk.',
      negative: 'Topic quality depends on when you register; the later picks are less interesting.',
      oneLiner: 'relaxed atmosphere and good feedback on the talk, but the topic quality depends on when you register.',
    },
    known_cautions: [{ level: 'medium', title: 'Mandatory attendance', text: 'Attendance is mandatory and topics are assigned first come, first served.' }],
  },
  {
    course_id: 'IN2346',
    course_name: 'Introduction to Deep Learning',
    ects: 6,
    course_type: 'Lecture + exercise',
    language: 'English',
    assessment_type: 'Written exam (90 min)',
    exam_style: 'written',
    workload_hours_per_week: 12,
    module_description:
      'Neural networks from the ground up: backpropagation, optimisation, convolutional and recurrent networks, regularisation, and an introduction to transformers. Programming exercises in PyTorch.',
    topics: ['deep learning', 'neural networks', 'machine learning', 'computer vision', 'pytorch', 'transformers', 'ai'],
    prerequisites: [
      { name: 'Linear algebra', keywords: ['linear algebra'] },
      { name: 'Programming in Python', keywords: ['python', 'programming'] },
      { name: 'Analysis', keywords: ['analysis', 'calculus'] },
    ],
    offering: { schedule: [{ day: 'Mon', start: '10:00', end: '12:00' }, { day: 'Fri', start: '10:00', end: '12:00' }], room: 'MW 0001', lecturer: 'Prof. Dr. S. Novak' },
    degree_groups: ['Machine Learning and Analytics'],
    weekly_workload: curve(11, 12, [15, 16, 17]),
    distributions: [
      dist('SS2024', 'endterm', 620, [10, 26, 22, 10, 32], 90),
      dist('WS2024', 'endterm', 710, [11, 27, 23, 9, 30], 104),
      dist('WS2024', 'retake', 190, [5, 20, 28, 15, 32], 30),
    ],
    review_stats: { count: 203, average: 4.0 },
    review_summary: {
      positive: 'Excellent exercises and a solid foundation for later ML courses.',
      negative: 'Huge course with crowded Q&A, and an exam that many find harder than the exercises.',
      oneLiner: 'great exercises, but a large course with a hard exam.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2064',
    course_name: 'Machine Learning',
    ects: 8,
    course_type: 'Lecture + exercise',
    language: 'English',
    assessment_type: 'Written exam (120 min)',
    exam_style: 'written',
    workload_hours_per_week: 13,
    module_description:
      'Probabilistic machine learning: regression, classification, kernels, Gaussian processes, dimensionality reduction, clustering and an introduction to deep learning. Strong emphasis on mathematical derivations.',
    topics: ['machine learning', 'probability', 'statistics', 'theory', 'ai', 'mathematics', 'deep learning'],
    prerequisites: [
      { name: 'Linear algebra', keywords: ['linear algebra'] },
      { name: 'Probability & statistics', keywords: ['probability', 'statistics', 'stochastics'] },
    ],
    offering: { schedule: [{ day: 'Tue', start: '10:00', end: '12:00' }, { day: 'Thu', start: '14:00', end: '16:00' }], room: 'MI HS 1', lecturer: 'Prof. Dr. J. Fischer' },
    degree_groups: ['Machine Learning and Analytics'],
    weekly_workload: curve(12, 13, [16, 18]),
    distributions: [
      dist('WS2023', 'endterm', 840, [9, 24, 26, 13, 28], 120),
      dist('WS2024', 'endterm', 905, [10, 25, 25, 12, 28], 132),
    ],
    review_stats: { count: 241, average: 4.2 },
    review_summary: {
      positive: 'Very well structured, excellent lecture notes and a rewarding challenge.',
      negative: 'Mathematically heavy; the exam leaves little time.',
      oneLiner: 'excellent material, but mathematically heavy with a tight exam.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2118',
    course_name: 'Database Systems on Modern CPU Architectures',
    ects: 6,
    course_type: 'Lecture + exercise',
    language: 'English',
    assessment_type: 'Oral exam',
    exam_style: 'oral',
    workload_hours_per_week: 10,
    module_description:
      'How modern database systems are built: storage, indexing, query compilation, vectorised execution, concurrency control and recovery. Exercises implement parts of a query engine in C++.',
    topics: ['databases', 'database', 'sql', 'data engineering', 'systems', 'c++', 'performance', 'data'],
    prerequisites: [
      { name: 'Database fundamentals', keywords: ['database', 'datenbanken', 'sql'] },
      { name: 'C++ programming', keywords: ['c++', 'cpp'], recommendedOnly: true, hint: 'The first exercise sheets ramp up C++ quickly.' },
    ],
    offering: { schedule: [{ day: 'Mon', start: '14:00', end: '16:00' }, { day: 'Wed', start: '10:00', end: '12:00' }], room: '02.11.018', lecturer: 'Prof. Dr. T. Neumann-Schulz' },
    degree_groups: ['Databases and Information Systems'],
    weekly_workload: curve(10),
    distributions: [dist('SS2024', 'endterm', 85, [30, 38, 18, 6, 8]), dist('SS2025', 'endterm', 92, [32, 36, 19, 5, 8])],
    review_stats: { count: 47, average: 4.5 },
    review_summary: {
      positive: 'Deep, practical insight into how real systems are built; great lecturer.',
      negative: 'C++ exercises are demanding if you have not used the language before.',
      oneLiner: 'deep and practical, but the C++ exercises are demanding.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2259',
    course_name: 'Cloud Computing and Distributed Systems',
    ects: 5,
    course_type: 'Lecture + exercise',
    language: 'English',
    assessment_type: 'Written exam (90 min)',
    exam_style: 'written',
    workload_hours_per_week: 7,
    module_description:
      'Architecture of distributed and cloud systems: replication, consensus, fault tolerance, containers, orchestration and serverless computing, with hands-on labs on a public cloud.',
    topics: ['cloud', 'distributed systems', 'distributed', 'systems', 'devops', 'industry', 'data engineering', 'kubernetes'],
    prerequisites: [{ name: 'Operating systems & networking', keywords: ['operating systems', 'networks', 'betriebssysteme', 'networking'] }],
    offering: { schedule: [{ day: 'Fri', start: '12:00', end: '14:00' }], room: 'MI HS 2', lecturer: 'Prof. Dr. R. Ivanova' },
    degree_groups: ['Software Engineering', 'Distributed Systems, Networking and Security'],
    weekly_workload: curve(7, 12, [9, 10, 11]),
    distributions: [dist('WS2024', 'endterm', 310, [14, 34, 28, 9, 15], 40)],
    review_stats: { count: 66, average: 3.9 },
    review_summary: {
      positive: 'Industry-relevant labs and a modern tech stack.',
      negative: 'Lectures are dense and some lab instructions are outdated.',
      oneLiner: 'industry-relevant labs, but dense lectures.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2312',
    course_name: 'Seminar: Information Retrieval and Search Engines',
    ects: 5,
    course_type: 'Seminar',
    language: 'English',
    assessment_type: 'Paper and talk',
    exam_style: 'seminar',
    workload_hours_per_week: 6,
    module_description:
      'Participants study classic and neural retrieval models, dense embeddings, ranking evaluation and retrieval-augmented generation, then present a paper and write a report.',
    topics: ['information retrieval', 'search', 'nlp', 'embeddings', 'llm', 'research', 'seminar', 'data'],
    prerequisites: [],
    offering: { schedule: [{ day: 'Thu', start: '16:00', end: '18:00' }], room: '00.13.009A', lecturer: 'Dr. P. Hoffmann' },
    degree_groups: ['Seminar'],
    weekly_workload: curve(5, 10, [8, 9, 5, 4, 3]),
    distributions: [dist('SS2025', 'endterm', 14, [50, 43, 7, 0, 0])],
    review_stats: { count: 15, average: 4.4 },
    review_summary: {
      positive: 'Interesting modern topics and a helpful supervisor.',
      negative: 'Few slots, and the report deadline falls in the exam period.',
      oneLiner: 'modern topics and helpful supervision, but few slots.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2190',
    course_name: 'Einführung in die Kryptographie',
    ects: 5,
    course_type: 'Lecture + exercise',
    language: 'German',
    assessment_type: 'Written exam (90 min)',
    exam_style: 'written',
    workload_hours_per_week: 8,
    module_description:
      'Mathematical foundations of modern cryptography: symmetric and public-key encryption, hash functions, signatures and security proofs.',
    topics: ['cryptography', 'security', 'theory', 'mathematics'],
    prerequisites: [{ name: 'Discrete mathematics', keywords: ['discrete', 'diskrete'] }],
    offering: { schedule: [{ day: 'Wed', start: '08:00', end: '10:00' }], room: 'MI HS 3', lecturer: 'Prof. Dr. K. Lehmann' },
    degree_groups: ['Distributed Systems, Networking and Security'],
    weekly_workload: curve(8, 13, [11, 12]),
    distributions: [dist('WS2024', 'endterm', 260, [12, 28, 27, 11, 22], 35)],
    review_stats: { count: 39, average: 3.8 },
    review_summary: {
      positive: 'Rigorous and well explained.',
      negative: 'Proof-heavy exam; German only.',
      oneLiner: 'rigorous, but proof-heavy and German only.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2397',
    course_name: 'Practical Course: Building Data Pipelines',
    ects: 10,
    course_type: 'Practical course',
    language: 'English',
    assessment_type: 'Project and presentation',
    exam_style: 'project',
    workload_hours_per_week: 13,
    module_description:
      'Teams design and operate a data platform: ingestion, stream processing, orchestration, data quality and dashboards, using open-source tools common in industry.',
    topics: ['data engineering', 'data', 'databases', 'sql', 'cloud', 'industry', 'project', 'python', 'hands-on'],
    prerequisites: [
      { name: 'Database fundamentals', keywords: ['database', 'datenbanken', 'sql'] },
      { name: 'Programming in Python', keywords: ['python', 'programming'] },
    ],
    offering: { schedule: [{ day: 'Thu', start: '10:00', end: '12:00' }], room: '01.07.023', lecturer: 'Dr. E. Wagner' },
    team_size: '4 students',
    applications_close: '2026-10-15',
    selection: true,
    degree_groups: ['Practical course'],
    weekly_workload: curve(12, 10, [15, 16, 17, 18, 15]),
    distributions: [dist('WS2024', 'endterm', 32, [44, 44, 9, 0, 3])],
    review_stats: { count: 21, average: 4.3 },
    review_summary: {
      positive: 'Hands-on and close to real industry work.',
      negative: 'Coordination overhead in teams and a busy final month.',
      oneLiner: 'close to real industry work, with a busy final month.',
    },
    known_cautions: [{ level: 'medium', title: 'Selection process', text: 'Places are assigned via the matching system; rank the course highly.' }],
  },
  {
    course_id: 'IN2323',
    course_name: 'Computer Vision III: Detection, Segmentation and Tracking',
    ects: 6,
    course_type: 'Lecture + exercise',
    language: 'English',
    assessment_type: 'Written exam (90 min)',
    exam_style: 'written',
    workload_hours_per_week: 10,
    module_description:
      'Object detection, instance and semantic segmentation, multi-object tracking and video understanding with deep learning.',
    topics: ['computer vision', 'deep learning', 'machine learning', 'ai', 'research'],
    prerequisites: [{ name: 'Neural network basics', keywords: ['deep learning', 'neural', 'machine learning'] }],
    offering: { schedule: [{ day: 'Tue', start: '16:00', end: '18:00' }], room: 'MI HS 2', lecturer: 'Prof. Dr. H. Yilmaz' },
    degree_groups: ['Computer Graphics and Vision'],
    weekly_workload: curve(10),
    distributions: [dist('SS2025', 'endterm', 240, [18, 36, 24, 8, 14], 30)],
    review_stats: { count: 52, average: 4.2 },
    review_summary: {
      positive: 'Up-to-date content and strong exercises.',
      negative: 'Assumes solid deep learning knowledge from day one.',
      oneLiner: 'up to date, but assumes solid deep learning knowledge.',
    },
    known_cautions: [],
  },
  {
    course_id: 'IN2400',
    course_name: 'Seminar: Responsible AI and Society',
    ects: 5,
    course_type: 'Seminar',
    language: 'English',
    assessment_type: 'Paper and talk',
    exam_style: 'seminar',
    workload_hours_per_week: 5,
    module_description:
      'Fairness, transparency, privacy and regulation of AI systems, including the EU AI Act. Participants write a short essay and lead a discussion session.',
    topics: ['ai', 'ethics', 'llm', 'society', 'research', 'seminar', 'regulation'],
    prerequisites: [],
    offering: { schedule: [{ day: 'Mon', start: '16:00', end: '18:00' }], room: '00.08.038', lecturer: 'Dr. N. Rossi' },
    degree_groups: ['Seminar', 'Interdisciplinary'],
    weekly_workload: curve(4, 9, [7, 8, 5, 4, 3, 3]),
    distributions: [dist('SS2025', 'endterm', 16, [62, 38, 0, 0, 0])],
    review_stats: { count: 18, average: 4.0 },
    review_summary: {
      positive: 'Lively discussions and a light workload.',
      negative: 'Less technical than some expect.',
      oneLiner: 'lively discussions and light workload, but not very technical.',
    },
    known_cautions: [],
  },
];

// A few written reviews per course, as stored in the reviews table.
export const SEED_REVIEWS = [
  { review_id: 1, course_id: 'IN2106-LLM', rating: 5, workload_hours: 15, semester: 'SS2025', review_text: 'Best course of my master. We fine-tuned an open model for legal question answering and learned a lot about evaluation.', created_at: '2025-08-02' },
  { review_id: 2, course_id: 'IN2106-LLM', rating: 4, workload_hours: 18, semester: 'WS2024', review_text: 'Very rewarding but the last four weeks were brutal. GPU queue was slow right before the deadline.', created_at: '2025-03-11' },
  { review_id: 3, course_id: 'IN2361', rating: 4, workload_hours: 9, semester: 'WS2024', review_text: 'Clear lectures and a fair exam. Exercise sheets took me longer than expected.', created_at: '2025-02-20' },
  { review_id: 4, course_id: 'IN2361', rating: 5, workload_hours: 8, semester: 'WS2023', review_text: 'Great overview from n-grams to transformers. Do the exercises, the exam is very close to them.', created_at: '2024-02-28' },
  { review_id: 5, course_id: 'IN2107-PML', rating: 4, workload_hours: 6, semester: 'WS2024', review_text: 'Relaxed seminar with good feedback on my talk. Register early to get a good topic.', created_at: '2025-02-10' },
  { review_id: 6, course_id: 'IN2346', rating: 4, workload_hours: 12, semester: 'WS2024', review_text: 'Exercises are excellent. The exam was much harder than the exercises though.', created_at: '2025-03-01' },
  { review_id: 7, course_id: 'IN2064', rating: 4, workload_hours: 14, semester: 'WS2024', review_text: 'Very math heavy but super well structured. The lecture notes are gold.', created_at: '2025-03-05' },
  { review_id: 8, course_id: 'IN2118', rating: 5, workload_hours: 10, semester: 'SS2025', review_text: 'You finally understand how a database works inside. C++ exercises are tough at first.', created_at: '2025-08-12' },
  { review_id: 9, course_id: 'IN2397', rating: 4, workload_hours: 14, semester: 'WS2024', review_text: 'Felt like a real job. Team coordination was the hardest part.', created_at: '2025-02-25' },
];

// What the mock transcript parser "reads" from an uploaded transcript.
export const SAMPLE_TRANSCRIPT = [
  { id: 'IN0001', name: 'Introduction to Informatics', ects: 6, grade: '1.7', semester: 'WS2021', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'IN0007', name: 'Fundamentals of Algorithms and Data Structures', ects: 6, grade: '1.3', semester: 'SS2022', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'MA0901', name: 'Linear Algebra for Informatics', ects: 8, grade: '2.7', semester: 'WS2021', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'MA0902', name: 'Analysis for Informatics', ects: 8, grade: '2.3', semester: 'SS2022', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'MA0911', name: 'Probability and Statistics', ects: 6, grade: '1.3', semester: 'WS2022', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'IN0008', name: 'Fundamentals of Databases', ects: 6, grade: '2.0', semester: 'WS2022', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'IN0009', name: 'Operating Systems and System Software', ects: 6, grade: '2.3', semester: 'WS2022', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'IN0010', name: 'Computer Networking and IT Security', ects: 6, grade: '2.0', semester: 'SS2023', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'IN0015', name: 'Discrete Structures', ects: 8, grade: '2.0', semester: 'WS2021', type: 'Lecture + exercise', exam_style: 'written' },
  { id: 'IN0012', name: 'Practical Course: Python for Data Science', ects: 10, grade: '1.3', semester: 'SS2023', type: 'Practical course', exam_style: 'project' },
  { id: 'IN0014', name: 'Seminar: Statistical Learning', ects: 4, grade: '1.7', semester: 'WS2023', type: 'Seminar', exam_style: 'seminar' },
  { id: 'IN0013', name: 'Software Engineering Project', ects: 10, grade: '1.3', semester: 'SS2024', type: 'Practical course', exam_style: 'project' },
];

export const SAMPLE_CV_SKILLS = ['Python', 'SQL', 'Docker', 'Data engineering', 'Git'];
