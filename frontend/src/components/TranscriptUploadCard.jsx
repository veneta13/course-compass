import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { useAppState } from '../state/AppState';

const MAX_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function TranscriptUploadCard() {
  const { profile, addDocument, removeDocument } = useAppState();
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState([]);

  const handleFiles = (fileList) => {
    const list = Array.from(fileList || []);
    const bad = list.filter((f) => !/\.pdf$/i.test(f.name) || f.size > MAX_BYTES);
    setRejected(bad.map((f) => f.name));
    list.filter((f) => !bad.includes(f)).forEach(addDocument);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs transition hover:shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">Show us what you have done</h2>
        <p className="text-sm text-slate-500 mt-0.5">Optional, but it lets us see which topics and course styles worked well for you.</p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
      />

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition ${
          isDragging ? 'border-blue-500 bg-blue-50/80 scale-[0.99]' : 'border-blue-200 bg-blue-50/30 hover:bg-blue-50/60 hover:border-blue-300'
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-xs">
          <UploadCloud className="w-5 h-5 stroke-[2.2]" />
        </div>
        <p className="text-sm text-slate-700 font-medium">
          <span className="hidden sm:inline">Drop transcripts or your CV here, or </span>
          <span className="text-blue-600 underline font-semibold hover:text-blue-700">
            <span className="sm:hidden">Upload transcripts or your CV</span>
            <span className="hidden sm:inline">browse files</span>
          </span>
        </p>
        <p className="text-xs text-slate-400 mt-1.5">PDF, up to 10 MB each · TUMonline transcript exports work best</p>
      </div>

      {rejected.length > 0 && (
        <p className="mt-3 text-xs text-rose-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Skipped {rejected.join(', ')}: only PDF files up to 10 MB are supported.
        </p>
      )}

      {profile.files.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {profile.files.map((file) => (
            <div key={file.id} className="flex items-center justify-between p-3 sm:p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                  <FileText className="w-5 h-5 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 truncate">{file.status === 'processing' ? `${formatFileSize(file.size)} · Reading document…` : file.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-3">
                {file.status === 'processing' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="hidden sm:inline">Processing</span>
                  </span>
                )}
                {file.status === 'processed' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span className="hidden sm:inline">Processed</span>
                  </span>
                )}
                {file.status === 'error' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Failed</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeDocument(file.id)}
                  disabled={file.status === 'processing'}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-200/60 disabled:opacity-40 transition cursor-pointer"
                  title="Remove file and the data read from it"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
