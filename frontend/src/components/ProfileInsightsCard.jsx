import React from 'react';
import { Brain, Sparkles, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export default function ProfileInsightsCard({ interestText = '', files = [] }) {
  const hasInterests = interestText.trim().length > 0;
  const hasFiles = files.length > 0;
  const hasData = hasInterests || hasFiles;

  // Extract keywords / tags dynamically from the interest text
  const extractedTopics = [];
  const textLower = interestText.toLowerCase();

  if (textLower.includes('nlp') || textLower.includes('language model') || textLower.includes('llm')) {
    extractedTopics.push('NLP & Large Language Models');
  }
  if (textLower.includes('machine learning') || textLower.includes('ml') || textLower.includes('ai')) {
    extractedTopics.push('Machine Learning');
  }
  if (textLower.includes('data') || textLower.includes('database') || textLower.includes('sql')) {
    extractedTopics.push('Data Engineering & Systems');
  }
  if (textLower.includes('practical') || textLower.includes('project') || textLower.includes('hands-on')) {
    extractedTopics.push('Hands-on / Practical Projects');
  }
  if (textLower.includes('theory') || textLower.includes('probability') || textLower.includes('math') || textLower.includes('statistics')) {
    extractedTopics.push('Probability & Theoretical Foundations');
  }
  if (textLower.includes('cloud') || textLower.includes('distributed')) {
    extractedTopics.push('Cloud & Distributed Systems');
  }

  // Detected constraints
  const detectedConstraints = [];
  if (textLower.includes('low workload') || textLower.includes('part-time') || textLower.includes('heavy') || textLower.includes('job')) {
    detectedConstraints.push('Workload / Schedule balanced');
  }
  if (textLower.includes('english')) {
    detectedConstraints.push('Taught in English');
  }
  if (textLower.includes('seminar')) {
    detectedConstraints.push('Seminar format preferred');
  }
  if (textLower.includes('research')) {
    detectedConstraints.push('Research-oriented curriculum');
  }

  return (
    <div className="bg-[#0f172a] rounded-2xl p-6 text-white shadow-lg border border-slate-800 transition">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          What we understand so far
        </h2>
        <span 
          className={`w-2 h-2 rounded-full ${hasData ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} 
          title={hasData ? 'Live Profile Model Active' : 'Waiting for Input'}
        />
      </div>

      {!hasData ? (
        <div className="py-6 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
          <Info className="w-6 h-6 text-slate-500 mx-auto" />
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Enter your interests above or upload your academic transcript to view live extracted competencies and curriculum constraints.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Detected Focus Areas */}
          <div>
            <span className="block text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2">
              DETECTED FOCUS TOPICS
            </span>
            <div className="flex flex-wrap gap-2">
              {extractedTopics.length > 0 ? (
                extractedTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700/80"
                  >
                    {topic}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400 italic">
                  Parsing custom text input...
                </span>
              )}
            </div>
          </div>

          {/* Preferences & Constraints */}
          {detectedConstraints.length > 0 && (
            <div>
              <span className="block text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2">
                MATCHING CONSTRAINTS
              </span>
              <div className="flex flex-wrap gap-2">
                {detectedConstraints.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#1e293b] text-blue-300 border border-blue-500/30"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Transcript Status */}
          <div>
            <span className="block text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-1.5">
              TRANSCRIPT STATUS
            </span>
            <p className="text-xs text-slate-300 leading-relaxed font-normal">
              {hasFiles
                ? `${files.length} document${files.length > 1 ? 's' : ''} attached. Ready to align recommendations with your completed TUM credits.`
                : 'No transcript uploaded yet. Recommendations will be generated using your query preferences.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
