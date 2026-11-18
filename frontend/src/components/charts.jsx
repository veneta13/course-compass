// Two small single-series bar charts for the course page. Plain HTML/CSS, no
// chart library: bars are anchored to a baseline with rounded tops, separated by
// a gap, with a hover tooltip and a table fallback for screen readers.
import { useState } from 'react';
import { GRADE_BANDS } from '../lib/format';

function Tooltip({ children }) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-slate-900 text-white text-[11px] whitespace-nowrap pointer-events-none z-10 shadow">
      {children}
    </div>
  );
}

export function GradeDistributionChart({ summary }) {
  const [hover, setHover] = useState(null);
  const { bands, total_students: total } = summary;
  if (!total) return <p className="text-xs text-slate-500 py-10 text-center">No grade data yet.</p>;
  const shares = GRADE_BANDS.map((b) => ({ ...b, count: bands[b.key], share: bands[b.key] / total }));
  const max = Math.max(...shares.map((s) => s.share));
  return (
    <div>
      <div className="flex items-end gap-1.5 h-36 border-b border-slate-200" role="img" aria-label="Grade distribution bar chart">
        {shares.map((s) => (
          <div
            key={s.key}
            className="relative flex-1 flex flex-col items-center justify-end h-full"
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === s.key && (
              <Tooltip>
                {s.label}: {s.count} students ({Math.round(s.share * 100)}%)
              </Tooltip>
            )}
            <span className="text-[11px] font-semibold text-slate-700 mb-1">{Math.round(s.share * 100)}%</span>
            <div
              className={`w-full rounded-t-[4px] transition-opacity ${s.key === 'failed' ? 'bg-slate-500' : 'bg-blue-700'} ${hover && hover !== s.key ? 'opacity-60' : ''}`}
              style={{ height: `${Math.max(2, (s.share / max) * 80)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        {shares.map((s) => (
          <div key={s.key} className="flex-1 text-center text-[11px] text-slate-500">
            {s.label}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Grade distribution</caption>
        <tbody>
          {shares.map((s) => (
            <tr key={s.key}>
              <th>{s.label}</th>
              <td>{s.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkloadChart({ weeks }) {
  const [hover, setHover] = useState(null);
  if (!weeks?.length) return <p className="text-xs text-slate-500 py-10 text-center">No workload data yet.</p>;
  const max = Math.max(...weeks);
  const sorted = [...weeks].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const isPeak = (h) => h >= median * 1.4;
  const peakIdx = weeks.map((h, i) => (isPeak(h) ? i : -1)).filter((i) => i >= 0);
  const peakLabel = peakIdx.length
    ? `Week${peakIdx.length > 1 ? 's' : ''} ${peakIdx[0] + 1}${peakIdx.length > 1 ? `–${peakIdx[peakIdx.length - 1] + 1}` : ''}: ${Math.min(...peakIdx.map((i) => weeks[i]))}–${Math.max(...peakIdx.map((i) => weeks[i]))} h`
    : null;
  return (
    <div>
      <div className="flex items-end gap-[3px] h-36 border-b border-slate-200" role="img" aria-label="Workload by week bar chart">
        {weeks.map((h, i) => (
          <div
            key={i}
            className="relative flex-1 flex items-end h-full"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && <Tooltip>Week {i + 1}: {h} h</Tooltip>}
            <div
              className={`w-full rounded-t-[4px] ${isPeak(h) ? 'bg-amber-700' : 'bg-blue-700'} ${hover !== null && hover !== i ? 'opacity-60' : ''}`}
              style={{ height: `${(h / max) * 95}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-slate-500">
        <span>Week 1</span>
        {peakLabel && <span className="font-semibold text-amber-800">{peakLabel}</span>}
        <span>Week {weeks.length}</span>
      </div>
      <table className="sr-only">
        <caption>Hours per week</caption>
        <tbody>
          {weeks.map((h, i) => (
            <tr key={i}>
              <th>Week {i + 1}</th>
              <td>{h} hours</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
