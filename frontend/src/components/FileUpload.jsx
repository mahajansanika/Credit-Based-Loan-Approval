/**
 * Drag-and-drop upload zone (PDF/CSV/Excel, ≤10MB). Posts to /api/upload,
 * then routes the parsed payload to onParsed (single applicant) or onBatch
 * (multiple rows). Rejections surface as specific toasts.
 */
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};
const MAX_SIZE = 10 * 1024 * 1024;

export default function FileUpload({ onParsed, onBatch }) {
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (accepted) => {
      if (!accepted.length) return;
      const file = accepted[0];
      const formData = new FormData();
      formData.append('file', file);
      setUploading(true);
      try {
        const res = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const { mode, applicants, missing, errors } = res.data;
        if (mode === 'batch') {
          onBatch(applicants, errors ?? []);
        } else if (mode === 'single') {
          onParsed(applicants[0], missing ?? [], errors ?? []);
        } else {
          (errors ?? ['Could not extract any fields from this file.']).forEach((e) => toast.error(e));
        }
      } catch {
        // interceptor already showed the toast
      } finally {
        setUploading(false);
      }
    },
    [onParsed, onBatch]
  );

  const onDropRejected = useCallback((rejections) => {
    for (const rejection of rejections) {
      for (const err of rejection.errors) {
        if (err.code === 'file-too-large') toast.error('File exceeds 10MB limit.');
        else if (err.code === 'file-invalid-type') toast.error('Only PDF, CSV, and Excel files accepted.');
        else toast.error(err.message);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPT,
    maxSize: MAX_SIZE,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
        isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
      }`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <p className="text-slate-600 font-medium animate-pulse">Parsing file…</p>
      ) : (
        <>
          <p className="text-slate-700 font-medium">
            {isDragActive ? 'Drop the file here' : 'Drag & drop a PDF, CSV or Excel file'}
          </p>
          <p className="text-sm text-slate-400 mt-1">or click to browse · max 10MB</p>
        </>
      )}
    </div>
  );
}
