import React from 'react';
import { useAppState } from '../state/AppState';
import { Link } from '../lib/router';

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

export default function PreferencesCard() {
  const { profile, updateProfile } = useAppState();
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
      <h2 className="text-lg font-bold text-slate-900 tracking-tight">Your semester</h2>
      <p className="text-sm text-slate-500 mt-0.5 mb-4">We use these as hard limits when ranking courses.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">Target ECTS</span>
          <input
            type="number"
            min="1"
            max="45"
            value={profile.targetEcts}
            onChange={(e) => updateProfile({ targetEcts: Math.max(1, Number(e.target.value) || 0) })}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">Hours per week for study</span>
          <select
            value={profile.maxHoursPerWeek || ''}
            onChange={(e) => updateProfile({ maxHoursPerWeek: e.target.value ? Number(e.target.value) : null })}
            className={inputCls}
          >
            <option value="">No limit</option>
            <option value="20">Up to 20 h</option>
            <option value="30">Up to 30 h</option>
            <option value="35">Up to 35 h</option>
            <option value="40">Up to 40 h</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">Language</span>
          <select value={profile.languagePref} onChange={(e) => updateProfile({ languagePref: e.target.value })} className={inputCls}>
            <option value="any">English or German</option>
            <option value="english">English only</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500 mt-4">
        Have a job, sports or other fixed weekly slots?{' '}
        <Link to="/plan" className="font-semibold text-blue-700 hover:underline">
          {profile.commitments.length ? `${profile.commitments.length} commitment${profile.commitments.length > 1 ? 's' : ''} in your calendar` : 'Add them to your calendar'}
        </Link>{' '}
        and we will avoid courses that clash.
      </p>
    </div>
  );
}
