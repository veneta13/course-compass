import React from 'react';
import { BookOpen, Calendar, BarChart3 } from 'lucide-react';

export default function RecommendationSourcesCard() {
  const sources = [
    {
      icon: BookOpen,
      title: 'Module descriptions',
      description: 'Content, prerequisites and exam format for every TUM module',
    },
    {
      icon: Calendar,
      title: "This semester's offering",
      description: 'Only courses running in winter 2026/27',
    },
    {
      icon: BarChart3,
      title: 'Past course statistics & student opinions',
      description: 'Grade distributions and feedback from previous semesters',
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
      <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-4">
        What the recommendations draw on
      </h3>

      <div className="space-y-4">
        {sources.map((src, index) => {
          const Icon = src.icon;
          return (
            <div key={index} className="flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50/80 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                <Icon className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {src.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-normal">
                  {src.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
