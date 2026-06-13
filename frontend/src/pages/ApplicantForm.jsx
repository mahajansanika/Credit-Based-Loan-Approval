/**
 * Panel 1 — Applicant Form. Manual entry with live derived fields (DTI %,
 * affordability buffer %), inline field-level validation (all 9 cases),
 * income sanity-cap override, and multi-format file upload (PDF/CSV/Excel)
 * with pre-fill + missing-field highlighting and batch detection.
 */
import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useConfig } from '../hooks/useConfig.js';
import { runValidation, deriveFields, coerceInputs, runFullEngine, FIELD_LABELS, INPUT_FIELDS } from '../engine/engine.js';
import { formatPercent, formatCurrency } from '../utils/formatCurrency.js';
import FileUpload from '../components/FileUpload.jsx';

const FIELD_META = [
  { name: 'monthly_income', placeholder: 'e.g. 45000', unit: '₹/month' },
  { name: 'monthly_expense', placeholder: 'e.g. 22000', unit: '₹/month' },
  { name: 'existing_loans', placeholder: 'e.g. 1', unit: 'count' },
  { name: 'credit_history_months', placeholder: 'e.g. 24', unit: 'months' },
  { name: 'defaults', placeholder: 'e.g. 0', unit: 'count' },
];

export default function ApplicantForm() {
  const navigate = useNavigate();
  const { config } = useConfig();
  const [mode, setMode] = useState('manual'); // 'manual' | 'upload'
  const [missingFields, setMissingFields] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [incomeOverride, setIncomeOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [batch, setBatch] = useState(null); // { applicants, errors }
  const [batchRunning, setBatchRunning] = useState(false);

  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: { name: '', monthly_income: '', monthly_expense: '', existing_loans: '', credit_history_months: '', defaults: '' },
  });
  const values = watch();

  const validation = useMemo(() => runValidation(values), [JSON.stringify(values)]);
  const derived = useMemo(() => deriveFields(coerceInputs(values)), [JSON.stringify(values)]);
  const anyValueEntered = INPUT_FIELDS.some((f) => values[f] !== '' && values[f] !== undefined);
  const incomeWarning = validation.warnings.monthly_income;
  const blocked = !validation.valid || (incomeWarning && !incomeOverride);

  const onParsed = (fields, missing, errors) => {
    for (const f of INPUT_FIELDS) {
      if (fields[f] !== null && fields[f] !== undefined) setValue(f, String(fields[f]), { shouldDirty: true });
    }
    if (fields.name) setValue('name', fields.name);
    setMissingFields(missing);
    setParseErrors(errors);
    setBatch(null);
    setMode('manual');
    if (missing.length > 0) {
      toast(`Pre-filled from file — ${missing.length} field(s) need manual entry.`, { icon: '📄' });
    } else {
      toast.success('All fields extracted from file.');
    }
  };

  const onBatch = (applicants, errors) => {
    setBatch({ applicants, errors });
    setParseErrors(errors);
  };

  const runBatch = async () => {
    setBatchRunning(true);
    try {
      const res = await api.post('/evaluate/batch', { applicants: batch.applicants, config });
      const { evaluated, failed, message } = res.data;
      if (evaluated === 0) {
        toast.error(message ?? 'No valid applicants found in file.');
        return;
      }
      toast.success(`Batch complete: ${evaluated} evaluated${failed ? `, ${failed} row(s) skipped` : ''}.`);
      navigate('/portfolio');
    } finally {
      setBatchRunning(false);
    }
  };

  const onSubmit = async (data) => {
    if (blocked) return;
    setSubmitting(true);
    try {
      const res = await api.post(
        '/evaluate',
        { name: data.name, inputs: data, config },
        { suppressToast: true }
      );
      navigate(`/result/${res.data.id}`, { state: { applicant: res.data.applicant } });
    } catch (err) {
      if (err.response?.status === 422) {
        toast.error('Input validation failed on the server. Check the field errors.');
      } else {
        // Backend unreachable — evaluate locally with the mirrored engine.
        const result = runFullEngine(data, config);
        if (result.decision === 'Invalid') {
          toast.error('Validation failed.');
        } else {
          toast('Backend unreachable — evaluated locally (not saved to portfolio).', { icon: '⚠️' });
          const inputs = coerceInputs(data);
          navigate('/result/local', {
            state: {
              applicant: {
                _id: 'local',
                name: data.name || 'Applicant',
                inputs,
                derivedFields: result.derivedFields,
                result,
                configName: config.name,
                createdAt: new Date().toISOString(),
              },
            },
          });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dtiTone =
    derived.dti === null ? 'text-slate-400'
      : derived.dti > config.scoringThresholds.dtiCritical ? 'text-red-600'
      : derived.dti > config.scoringThresholds.dtiHighRisk ? 'text-amber-600'
      : 'text-emerald-600';
  const bufferTone =
    derived.affordability_buffer === null ? 'text-slate-400'
      : derived.affordability_buffer < config.scoringThresholds.minAffordBuffer ? 'text-red-600'
      : 'text-emerald-600';

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h1 className="section-title">New Applicant</h1>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`px-4 py-1.5 ${mode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
              >
                Manual Entry
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`px-4 py-1.5 ${mode === 'upload' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
              >
                Upload File
              </button>
            </div>
          </div>

          {mode === 'upload' && (
            <div className="mb-4">
              <FileUpload onParsed={onParsed} onBatch={onBatch} />
              {batch && (
                <div className="mt-4 border border-indigo-200 bg-indigo-50 rounded-lg p-4">
                  <p className="font-medium text-indigo-900">
                    Batch detected: {batch.applicants.length} applicants in this file.
                  </p>
                  {batch.errors.length > 0 && (
                    <ul className="mt-2 text-xs text-amber-700 list-disc list-inside">
                      {batch.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                      {batch.errors.length > 5 && <li>…and {batch.errors.length - 5} more</li>}
                    </ul>
                  )}
                  <button type="button" className="btn-primary mt-3" onClick={runBatch} disabled={batchRunning}>
                    {batchRunning ? 'Evaluating batch…' : `Evaluate all ${batch.applicants.length} applicants`}
                  </button>
                </div>
              )}
            </div>
          )}

          {parseErrors.length > 0 && !batch && (
            <div className="mb-4 border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
              {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Applicant name (optional)</label>
                <input className="input" placeholder="e.g. Priya Sharma" {...register('name')} />
              </div>
              {FIELD_META.map(({ name, placeholder, unit }) => {
                const error = anyValueEntered || values[name] !== '' ? validation.errors[name] : null;
                const isMissing = missingFields.includes(name);
                return (
                  <div key={name}>
                    <label className="label">
                      {FIELD_LABELS[name]} <span className="text-slate-400 font-normal">({unit})</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`input ${error ? 'input-error' : ''} ${isMissing && !values[name] ? 'input-missing' : ''}`}
                      placeholder={placeholder}
                      {...register(name)}
                    />
                    {error && <p className="field-error">{error}</p>}
                    {isMissing && !values[name] && !error && (
                      <p className="mt-1 text-xs text-amber-600">Not found in file — enter manually.</p>
                    )}
                  </div>
                );
              })}
            </div>

            {incomeWarning && (
              <div className="mt-4 border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm">
                <p className="text-amber-800">{incomeWarning}</p>
                <label className="mt-2 flex items-center gap-2 text-amber-900 font-medium">
                  <input
                    type="checkbox"
                    checked={incomeOverride}
                    onChange={(e) => setIncomeOverride(e.target.checked)}
                  />
                  I have verified this income is correct
                </label>
              </div>
            )}

            <button type="submit" className="btn-primary mt-5 w-full sm:w-auto" disabled={blocked || submitting}>
              {submitting ? 'Evaluating…' : 'Evaluate Application'}
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Live derived fields</h2>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-600">Debt-to-income (DTI)</span>
              <span className={`text-2xl font-bold tabular-nums ${dtiTone}`}>
                {derived.dti !== null ? formatPercent(derived.dti) : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-600">Affordability buffer</span>
              <span className={`text-2xl font-bold tabular-nums ${bufferTone}`}>
                {derived.affordability_buffer !== null ? formatPercent(derived.affordability_buffer) : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-600">Monthly surplus</span>
              <span className="text-lg font-semibold tabular-nums text-slate-700">
                {derived.dti !== null
                  ? formatCurrency(coerceInputs(values).monthly_income - coerceInputs(values).monthly_expense)
                  : '—'}
              </span>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Safe DTI ≤ {formatPercent(config.scoringThresholds.dtiSafe)} · high-risk &gt;{' '}
            {formatPercent(config.scoringThresholds.dtiHighRisk)} · hard reject &gt;{' '}
            {formatPercent(config.hardRejectRules.find((r) => r.field === 'dti')?.threshold ?? 0.8)}
          </p>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">File formats</h2>
          <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
            <li>PDF — labelled values ("Monthly income: ₹45,000")</li>
            <li>CSV — header row or key,value pairs; multiple rows = batch</li>
            <li>Excel (.xlsx / .xls) — first sheet, same headers</li>
            <li>Headers: monthly_income, monthly_expense, existing_loans, credit_history_months, defaults</li>
            <li>Max size 10MB</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
