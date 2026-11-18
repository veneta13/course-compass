// Contribution forms on the course page: leave a review, share exam results.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ImageUp, X } from 'lucide-react';
import { api } from '../api/client';

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

// Recent semesters a student could have taken the course in.
const SEMESTERS = ['SS2026', 'WS2025', 'SS2025', 'WS2024', 'SS2024', 'WS2023'];
const semesterLabel = (s) => (s.startsWith('WS') ? `Winter ${s.slice(2)}/${String(Number(s.slice(2)) + 1).slice(2)}` : `Summer ${s.slice(2)}`);

function Success({ children, onAgain }) {
  return (
    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
      <div>
        {children}
        {onAgain && (
          <button type="button" onClick={onAgain} className="block mt-1 text-xs font-semibold underline cursor-pointer">
            Submit another
          </button>
        )}
      </div>
    </div>
  );
}

export function ReviewForm({ courseId, onSubmitted }) {
  const [form, setForm] = useState({ rating: 0, workload_hours: '', semester: SEMESTERS[1], review_text: '' });
  const [status, setStatus] = useState({ saving: false, error: null, done: false });
  const [hoverStar, setHoverStar] = useState(0);

  const valid = form.rating > 0 && form.review_text.trim().length >= 20;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setStatus({ saving: true, error: null, done: false });
    try {
      await api.submitReview(courseId, {
        rating: form.rating,
        workload_hours: form.workload_hours ? Number(form.workload_hours) : null,
        semester: form.semester,
        review_text: form.review_text.trim(),
      });
      setStatus({ saving: false, error: null, done: true });
      setForm({ rating: 0, workload_hours: '', semester: SEMESTERS[1], review_text: '' });
      onSubmitted?.();
    } catch (err) {
      setStatus({ saving: false, error: err.message, done: false });
    }
  };

  if (status.done) {
    return <Success onAgain={() => setStatus({ saving: false, error: null, done: false })}>Thanks! Your review is now part of this course's rating.</Success>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Your rating</label>
        <div className="flex gap-1" onMouseLeave={() => setHoverStar(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i} star${i > 1 ? 's' : ''}`}
              onMouseEnter={() => setHoverStar(i)}
              onClick={() => setForm({ ...form, rating: i })}
              className="p-1 cursor-pointer"
            >
              <svg viewBox="0 0 20 20" className={`w-7 h-7 ${i <= (hoverStar || form.rating) ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor">
                <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Semester you took it</label>
          <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} className={inputCls}>
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                {semesterLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Hours per week (optional)</label>
          <input type="number" min="0" max="60" value={form.workload_hours} onChange={(e) => setForm({ ...form, workload_hours: e.target.value })} className={inputCls} placeholder="e.g. 10" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Your experience</label>
        <textarea
          rows={4}
          value={form.review_text}
          onChange={(e) => setForm({ ...form, review_text: e.target.value })}
          className={`${inputCls} resize-none`}
          placeholder="What was good, what was hard, and what should future students know?"
        />
        <p className="text-[11px] text-slate-400 mt-1">At least 20 characters. Reviews are anonymous.</p>
      </div>
      {status.error && <p className="text-xs text-rose-600">{status.error}</p>}
      <button
        type="submit"
        disabled={!valid || status.saving}
        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition cursor-pointer"
      >
        {status.saving ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Students upload a screenshot of the official grade statistics. The backend
// reads the counts from the image and adds them after a check, so nothing is
// typed in by hand.
export function GradeDistributionForm({ courseId }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [meta, setMeta] = useState({ semester: SEMESTERS[1], exam_type: 'endterm' });
  const [status, setStatus] = useState({ saving: false, error: null, done: false });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f) => {
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) return setStatus({ saving: false, done: false, error: 'Please choose a PNG, JPG or WEBP image.' });
    if (f.size > MAX_IMAGE_BYTES) return setStatus({ saving: false, done: false, error: 'The image is larger than 5 MB.' });
    setStatus({ saving: false, done: false, error: null });
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setStatus({ saving: true, error: null, done: false });
    try {
      await api.uploadGradeDistribution(courseId, { file, ...meta });
      setStatus({ saving: false, error: null, done: true });
      setFile(null);
    } catch (err) {
      setStatus({ saving: false, error: err.message, done: false });
    }
  };

  if (status.done) {
    return (
      <Success onAgain={() => setStatus({ saving: false, error: null, done: false })}>
        Thanks! We received your screenshot. The results are added to the grade distribution once the numbers have been read and checked.
      </Success>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed">
        Upload a screenshot of the official grade statistics published after the exam, for example from TUMonline. Make sure the number of students per grade is readable.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
          <select value={meta.semester} onChange={(e) => setMeta({ ...meta, semester: e.target.value })} className={inputCls}>
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                {semesterLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Exam</label>
          <select value={meta.exam_type} onChange={(e) => setMeta({ ...meta, exam_type: e.target.value })} className={inputCls}>
            <option value="endterm">End-term exam</option>
            <option value="retake">Retake</option>
          </select>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {preview ? (
        <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-2">
          <img src={preview} alt="Preview of the uploaded grade statistics" className="max-h-72 w-full object-contain rounded-lg" />
          <div className="flex items-center justify-between gap-2 mt-2 px-1">
            <span className="text-xs text-slate-600 truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 cursor-pointer">
              <X className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center text-center cursor-pointer transition ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 bg-blue-50/30 hover:bg-blue-50/60'
          }`}
        >
          <ImageUp className="w-6 h-6 text-blue-600 mb-2" />
          <p className="text-sm font-medium text-slate-700">
            <span className="hidden sm:inline">Drop a screenshot here, or </span>
            <span className="text-blue-600 underline font-semibold">
              <span className="sm:hidden">Choose a screenshot</span>
              <span className="hidden sm:inline">browse</span>
            </span>
          </p>
          <p className="text-xs text-slate-400 mt-1">PNG, JPG or WEBP, up to 5 MB</p>
        </div>
      )}

      {status.error && <p className="text-xs text-rose-600">{status.error}</p>}
      <button
        type="submit"
        disabled={!file || status.saving}
        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition cursor-pointer"
      >
        {status.saving ? 'Uploading…' : 'Upload results'}
      </button>
    </form>
  );
}
