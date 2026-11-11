import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, Check, X } from 'lucide-react';

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function TranscriptUploadCard({ files, setFiles }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((f) => ({
        name: f.name,
        size: f.size,
        description: `${formatFileSize(f.size)} · Ready for matching`,
        status: 'Processed'
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).map((f) => ({
        name: f.name,
        size: f.size,
        description: `${formatFileSize(f.size)} · Ready for matching`,
        status: 'Processed'
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs transition hover:shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          Show us what you have done
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Optional, but it lets us see which topics and course styles worked well for you.
        </p>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx"
        multiple
        className="hidden"
      />

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition ${
          isDragging
            ? 'border-blue-500 bg-blue-50/80 scale-[0.99]'
            : 'border-blue-200 bg-blue-50/30 hover:bg-blue-50/60 hover:border-blue-300'
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-xs">
          <UploadCloud className="w-5 h-5 stroke-[2.2]" />
        </div>

        <p className="text-sm text-slate-700 font-medium">
          Drop transcripts or your CV here, or{' '}
          <span className="text-blue-600 underline font-semibold hover:text-blue-700">
            browse files
          </span>
        </p>

        <p className="text-xs text-slate-400 mt-1.5">
          PDF, DOCX up to 10 MB each · TUMonline transcript exports supported
        </p>
      </div>

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {files.map((file, idx) => (
            <div
              key={idx}
              className="group flex items-center justify-between p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl hover:border-slate-300 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 shadow-2xs">
                  <FileText className="w-5 h-5 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {file.description || formatFileSize(file.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-md">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  Uploaded
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(idx);
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-200/60 transition cursor-pointer"
                  title="Remove file"
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
