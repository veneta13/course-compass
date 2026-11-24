// Small shared building blocks matching the existing card style.
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Link } from '../lib/router';

export function Card({ className = '', padding = 'p-5 sm:p-6', children, ...rest }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs ${padding} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Tag({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-white text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200/70',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function MatchBadge({ match, size = 'md' }) {
  const strong = match >= 80;
  const cls = strong ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
  return (
    <div className={`inline-flex items-center gap-2 rounded-xl ${cls} ${size === 'lg' ? 'px-5 py-3' : 'px-4 py-2'} shrink-0`}>
      <span className={`font-extrabold tracking-tight ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}>{match}%</span>
      <span className="text-[11px] font-semibold leading-tight">
        match
        <br />
        for you
      </span>
    </div>
  );
}

export function StatTile({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded-xl px-4 py-3 min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-900 mt-0.5 truncate">
        {value}
        {sub && <span className="text-[11px] font-normal text-slate-400"> · {sub}</span>}
      </div>
    </div>
  );
}

export function BackLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition">
      <span aria-hidden>‹</span> {children}
    </Link>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-4">
      <span>Something went wrong: {error?.message || String(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline cursor-pointer">
          Try again
        </button>
      )}
    </div>
  );
}

const CAUTION_STYLES = {
  high: { box: 'bg-amber-50/80', icon: 'text-amber-600', label: 'text-amber-700', Icon: AlertTriangle, name: 'High' },
  medium: { box: 'bg-amber-50/80', icon: 'text-amber-600', label: 'text-amber-700', Icon: AlertTriangle, name: 'Medium' },
  low: { box: 'bg-slate-50', icon: 'text-slate-500', label: 'text-slate-600', Icon: Info, name: 'Low' },
};

export function CautionItem({ caution, detailed = false }) {
  const s = CAUTION_STYLES[caution.level] || CAUTION_STYLES.low;
  const Icon = s.Icon;
  if (!detailed) {
    return (
      <li className="flex gap-2 text-xs text-slate-700 leading-relaxed">
        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.icon}`} />
        <span>{caution.text}</span>
      </li>
    );
  }
  return (
    <div className={`rounded-xl p-4 flex gap-3 ${s.box}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} />
      <div>
        <div className="text-sm">
          <span className={`font-semibold ${s.label}`}>{s.name}</span>
          <span className="text-slate-400"> · </span>
          <span className="font-semibold text-slate-900">{caution.title}</span>
        </div>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{caution.text}</p>
      </div>
    </div>
  );
}

export function Stars({ value, size = 'w-4 h-4' }) {
  return (
    <span className="inline-flex items-center" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className={`${size} ${i <= Math.round(value) ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  );
}
