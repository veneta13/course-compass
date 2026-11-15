import React, { useState } from 'react';
import { 
  User, 
  GraduationCap, 
  BookOpen, 
  Award, 
  Calendar, 
  Mail, 
  FileText, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  Sparkles, 
  TrendingUp, 
  Layers,
  Clock,
  Briefcase,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';

const TIME_COMMITMENT_OPTIONS = [
  'Full-time Study (0h external work)',
  'Working Student (10-15h / week)',
  'Working Student (15-20h / week)',
  'Working Student (20+ h / week)',
  'Part-time / Internship',
  'Family & Personal Commitments'
];

export default function UserProfile({ onNavigateToFinder }) {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    firstName: 'Test',
    lastName: 'Student',
    email: 'test.student@tum.de',
    degreeProgram: 'M.Sc. Informatics',
    faculty: 'TUM School of Computation, Information and Technology',
    currentSemester: 1,
    targetGraduation: 'Winter 2027/28',
    targetEcts: 120,
    specialization: 'Information Systems & Data Engineering',
    maxEctsPerSemester: 30,
    preferredLanguage: 'English & German',
    timeCommitment: 'Working Student (15-20h / week)'
  });

  const [editForm, setEditForm] = useState({ ...profile });

  const [completedCourses, setCompletedCourses] = useState([]);

  const [skills, setSkills] = useState([]);

  const [newSkill, setNewSkill] = useState('');
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourse, setNewCourse] = useState({
    id: '',
    name: '',
    ects: 6,
    grade: '',
    semester: 'Winter 2026/27',
    type: 'Elective'
  });

  const handleSaveProfile = (e) => {
    e.preventDefault();
    setProfile({ ...editForm });
    setIsEditing(false);
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    if (newSkill.trim() && !skills.some(s => s.name.toLowerCase() === newSkill.trim().toLowerCase())) {
      setSkills([...skills, { name: newSkill.trim(), level: 'Intermediate' }]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillName) => {
    setSkills(skills.filter(s => s.name !== skillName));
  };

  const handleAddCourse = (e) => {
    e.preventDefault();
    if (newCourse.name.trim() && newCourse.id.trim()) {
      setCompletedCourses([
        ...completedCourses, 
        { ...newCourse, ects: Number(newCourse.ects) }
      ]);
      setNewCourse({
        id: '',
        name: '',
        ects: 6,
        grade: '',
        semester: 'Winter 2026/27',
        type: 'Elective'
      });
      setShowAddCourse(false);
    }
  };

  const handleRemoveCourse = (courseId) => {
    setCompletedCourses(completedCourses.filter(c => c.id !== courseId));
  };

  // Calculate dynamic stats
  const totalEarnedEcts = completedCourses.reduce((sum, c) => sum + (Number(c.ects) || 0), 0);
  const progressPercent = Math.min(100, Math.round((totalEarnedEcts / (profile.targetEcts || 120)) * 100));

  // Dynamic GPA calculation from graded courses
  const gradedCourses = completedCourses.filter(
    (c) => c.grade && !isNaN(parseFloat(c.grade)) && Number(c.ects) > 0
  );
  const dynamicGpa = gradedCourses.length > 0
    ? (
        gradedCourses.reduce((sum, c) => sum + parseFloat(c.grade) * Number(c.ects), 0) /
        gradedCourses.reduce((sum, c) => sum + Number(c.ects), 0)
      ).toFixed(2)
    : '—';

  const avatarInitials = `${(profile.firstName?.[0] || 'T')}${(profile.lastName?.[0] || 'S')}`.toUpperCase();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Breadcrumb / Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button 
            type="button"
            onClick={onNavigateToFinder}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Course Matcher
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Student Profile & Academic Records
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your academic progress, TUM curriculum constraints, and recommendation preferences.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                setEditForm({ ...profile });
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
              Edit Profile
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 font-semibold text-xs hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition shadow-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Profile Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-2xl flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              {avatarInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {profile.firstName} {profile.lastName}
                </h2>
              </div>
              <p className="text-sm font-medium text-slate-600 mt-0.5">
                {profile.degreeProgram} · Semester {profile.currentSemester}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {profile.faculty}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full md:w-auto">
            <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 text-center">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Completed ECTS</span>
              <span className="text-lg font-extrabold text-blue-600 mt-0.5 block">{totalEarnedEcts} / {profile.targetEcts}</span>
            </div>
            <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 text-center">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Average Grade</span>
              <span className="text-lg font-extrabold text-emerald-600 mt-0.5 block">{dynamicGpa}</span>
            </div>
            <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Target Graduation</span>
              <span className="text-sm font-bold text-slate-700 mt-1 block">{profile.targetGraduation}</span>
            </div>
          </div>
        </div>

        {/* ECTS Progress Bar */}
        <div className="mt-6">
          <div className="flex justify-between items-center text-xs font-semibold mb-2">
            <span className="text-slate-600 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              Degree Progress ({progressPercent}%)
            </span>
            <span className="text-slate-400">{Math.max(0, profile.targetEcts - totalEarnedEcts)} ECTS remaining</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Profile Details & Preferences Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Student Details & Constraints */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              Student Details
            </h3>

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">TUM Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Degree Program</label>
                  <input
                    type="text"
                    value={editForm.degreeProgram}
                    onChange={(e) => setEditForm({ ...editForm, degreeProgram: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Specialization Focus</label>
                  <input
                    type="text"
                    value={editForm.specialization}
                    onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Time Commitment</label>
                  <select
                    value={editForm.timeCommitment}
                    onChange={(e) => setEditForm({ ...editForm, timeCommitment: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {TIME_COMMITMENT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target ECTS Per Semester</label>
                  <input
                    type="number"
                    value={editForm.maxEctsPerSemester}
                    onChange={(e) => setEditForm({ ...editForm, maxEctsPerSemester: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">TUM Email:</span>
                  <span className="font-semibold text-slate-800">{profile.email}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Degree Program:</span>
                  <span className="font-semibold text-slate-800">{profile.degreeProgram}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Specialization:</span>
                  <span className="font-semibold text-blue-700">{profile.specialization}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Time Commitment:</span>
                  <span className="font-semibold text-slate-800">{profile.timeCommitment}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Max Workload:</span>
                  <span className="font-semibold text-slate-800">{profile.maxEctsPerSemester} ECTS / semester</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Languages:</span>
                  <span className="font-semibold text-slate-800">{profile.preferredLanguage}</span>
                </div>
              </div>
            )}
          </div>

          {/* Core Skills & Competencies */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Skills & Knowledge
              </span>
              <span className="text-xs font-semibold text-slate-400">{skills.length} listed</span>
            </h3>

            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {skills.map((skill) => (
                  <span
                    key={skill.name}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 group hover:border-slate-300"
                  >
                    <span>{skill.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill.name)}
                      className="text-slate-400 hover:text-rose-500 p-0.5 rounded cursor-pointer"
                      title="Remove skill"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mb-4">
                No skills listed yet. Add your programming languages, tools, or domain knowledge below.
              </p>
            )}

            <form onSubmit={handleAddSkill} className="flex gap-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Add skill (e.g. PyTorch, Rust)..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!newSkill.trim()}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
              >
                Add
              </button>
            </form>
          </div>
        </div>

        {/* Right 2 Columns: Completed Modules & Curriculum Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  Completed Courses & Grades
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Imported from transcript or added manually to calculate prerequisites.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddCourse(!showAddCourse)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/80 font-semibold text-xs hover:bg-blue-100 transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Course
              </button>
            </div>

            {/* Add Course Form */}
            {showAddCourse && (
              <form onSubmit={handleAddCourse} className="mb-6 p-4 rounded-xl bg-blue-50/40 border border-blue-100 space-y-3 text-xs">
                <div className="font-bold text-slate-800">Add Completed Course</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Module Code</label>
                    <input
                      type="text"
                      placeholder="e.g. IN2041"
                      value={newCourse.id}
                      onChange={(e) => setNewCourse({ ...newCourse, id: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Course Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Machine Learning"
                      value={newCourse.name}
                      onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">ECTS Credits</label>
                    <input
                      type="number"
                      value={newCourse.ects}
                      onChange={(e) => setNewCourse({ ...newCourse, ects: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                      min="1"
                      max="30"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Grade (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 1.3"
                      value={newCourse.grade}
                      onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCourse(false)}
                    className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200/50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
                  >
                    Save Course
                  </button>
                </div>
              </form>
            )}

            {/* Courses Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase font-semibold">
                    <th className="pb-3 pl-2">Module Code</th>
                    <th className="pb-3">Course Title</th>
                    <th className="pb-3 text-center">ECTS</th>
                    <th className="pb-3 text-center">Grade</th>
                    <th className="pb-3">Semester</th>
                    <th className="pb-3 text-right pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completedCourses.length > 0 ? (
                    completedCourses.map((course) => (
                      <tr key={course.id} className="hover:bg-slate-50/60 transition group">
                        <td className="py-3 pl-2 font-mono font-semibold text-blue-700">
                          {course.id}
                        </td>
                        <td className="py-3 font-medium text-slate-800">
                          <div>{course.name}</div>
                          <span className="text-[10px] text-slate-400 font-normal">{course.type}</span>
                        </td>
                        <td className="py-3 text-center font-bold text-slate-700">
                          {course.ects}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded font-bold ${
                            parseFloat(course.grade) <= 1.3
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : parseFloat(course.grade) <= 2.0
                              ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                              : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                          }`}>
                            {course.grade || '—'}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">
                          {course.semester}
                        </td>
                        <td className="py-3 text-right pr-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveCourse(course.id)}
                            className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                            title="Remove course"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-400">
                        <p className="font-medium text-slate-500 mb-1">No completed courses added yet</p>
                        <p className="text-[11px] text-slate-400">
                          Add your completed courses manually with &quot;Add Course&quot; or upload your transcript.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
