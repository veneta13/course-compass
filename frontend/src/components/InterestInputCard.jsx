import React from 'react';
import { Compass, Plus, Check, X } from 'lucide-react';

const QUICK_TAGS = [
  'Hands-on projects',
  'Low workload',
  'Taught in English',
  'Industry relevance',
  'Research-oriented',
  'Seminar format'
];

export default function InterestInputCard({ interestText, setInterestText }) {
  const handleTagClick = (tag) => {
    if (interestText.toLowerCase().includes(tag.toLowerCase())) {
      // Remove tag if already present
      const regex = new RegExp(`(^|\\s|\\.\\s*)?(Looking for )?${tag}(\\.|,)?`, 'gi');
      const updated = interestText.replace(regex, '').trim();
      setInterestText(updated);
    } else {
      // Append tag
      setInterestText((prev) => {
        const trimmed = prev.trim();
        if (trimmed.length === 0) return tag;
        return `${trimmed}${trimmed.endsWith('.') ? ' ' : '. '}Looking for ${tag.toLowerCase()}.`;
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs transition hover:shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          What are you interested in?
        </h2>
        <div className="flex items-center gap-3">
          {interestText && (
            <button
              type="button"
              onClick={() => setInterestText('')}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-blue-500" />
            Natural Language Query
          </span>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={interestText}
          onChange={(e) => setInterestText(e.target.value)}
          rows={4}
          placeholder="Describe your interests, career goals, target topics, or scheduling constraints (e.g., 'Looking for practical machine learning and distributed systems with moderate workload')..."
          className="w-full rounded-xl border border-slate-200 p-4 text-slate-800 text-sm leading-relaxed placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition resize-none bg-slate-50/40"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs font-semibold text-slate-500 mr-1">Quick add:</span>
        {QUICK_TAGS.map((tag) => {
          const isIncluded = interestText.toLowerCase().includes(tag.toLowerCase());
          return (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer border ${
                isIncluded
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {isIncluded ? <Check className="w-3 h-3 text-blue-600" /> : <Plus className="w-3 h-3 text-slate-400" />}
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
