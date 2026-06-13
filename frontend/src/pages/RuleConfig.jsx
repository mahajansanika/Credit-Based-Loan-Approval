/**
 * Panel 2 — Dynamic Rule Config editor. Edits every part of the config
 * object: hard reject rules, scoring weights (with live sum + auto-normalise
 * indicator), thresholds, score bands (gap/overlap detection), and the
 * interaction rule builder. Save/load/activate/delete configs in MongoDB,
 * plus JSON import/export. Sticky save bar with unsaved-changes indicator.
 */
import { useRef, useState } from 'react';
import { useConfig } from '../hooks/useConfig.js';
import { FIELD_LABELS } from '../engine/engine.js';
import BandEditor from '../components/BandEditor.jsx';
import RuleBuilder from '../components/RuleBuilder.jsx';

const FIELD_OPTIONS = Object.keys(FIELD_LABELS);
const OPERATORS = ['gt', 'lt', 'eq', 'gte', 'lte', 'neq'];
const WEIGHT_LABELS = {
  dti: 'DTI',
  history: 'Credit history',
  defaults: 'Defaults',
  loanBurden: 'Loan burden',
  affordabilityBuffer: 'Affordability buffer',
};
const WEIGHT_COLORS = ['bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
const THRESHOLD_META = {
  dtiSafe: { label: 'DTI safe (fraction)', step: 0.01 },
  dtiHighRisk: { label: 'DTI high-risk (fraction)', step: 0.01 },
  dtiCritical: { label: 'DTI critical (fraction)', step: 0.01 },
  maxLoans: { label: 'Max loans', step: 1 },
  minAffordBuffer: { label: 'Min affordability buffer (fraction)', step: 0.01 },
  excellentBuffer: { label: 'Excellent buffer (fraction)', step: 0.01 },
  excellentHistory: { label: 'Excellent history (months)', step: 1 },
  goodHistory: { label: 'Good history (months)', step: 1 },
};

export default function RuleConfig() {
  const {
    config, setConfig, warnings, dirty, offline,
    activeName, savedConfigs,
    saveConfig, activateConfig, deleteConfig, loadConfig, resetToDefault,
    exportJSON, importJSON,
  } = useConfig();
  const [saveName, setSaveName] = useState(config.name ?? 'My Policy');
  const [saving, setSaving] = useState(false);
  const importRef = useRef(null);

  const weightSum = Object.values(config.scoringWeights).reduce((a, w) => a + (Number(w) || 0), 0);
  const sumOk = Math.abs(weightSum - 1) < 1e-9;
  const bandWarnings = warnings.filter((w) => w.type === 'band_gap' || w.type === 'band_overlap');
  const otherWarnings = warnings.filter((w) => w.type !== 'band_gap' && w.type !== 'band_overlap');

  const patch = (key, value) => setConfig({ ...config, [key]: value });

  const updateHardRule = (index, p) =>
    patch('hardRejectRules', config.hardRejectRules.map((r, i) => (i === index ? { ...r, ...p } : r)));
  const addHardRule = () =>
    patch('hardRejectRules', [
      ...config.hardRejectRules,
      {
        id: `hr_custom_${Date.now()}`,
        name: 'New rule',
        field: 'monthly_income',
        operator: 'lt',
        threshold: 0,
        reason: '{field:monthly_income} breaches the threshold of {threshold}.',
      },
    ]);
  const removeHardRule = (index) =>
    patch('hardRejectRules', config.hardRejectRules.filter((_, i) => i !== index));

  const addInteractionRule = () =>
    patch('interactionRules', [
      ...config.interactionRules,
      {
        id: `ir_custom_${Date.now()}`,
        name: 'New interaction rule',
        logic: 'AND',
        effect: 'penalty',
        magnitude: 50,
        conditions: [{ field: 'dti', operator: 'gt', threshold: 0.5 }],
        reason: 'Compound risk detected (DTI {field:dti}). Penalty: {magnitude} points.',
      },
    ]);

  const onSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await saveConfig(saveName.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Rule Configuration</h1>
          <p className="text-sm text-slate-500">
            Active config: <span className="font-medium text-slate-700">{activeName}</span>
            {offline && <span className="ml-2 text-amber-600">(backend offline — edits apply locally)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={exportJSON}>Export JSON</button>
          <button className="btn-secondary text-sm" onClick={() => importRef.current?.click()}>Import JSON</button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) importJSON(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <button className="btn-secondary text-sm" onClick={resetToDefault}>Reset to Default</button>
        </div>
      </div>

      {otherWarnings.length > 0 && (
        <div className="card border-amber-300 bg-amber-50">
          <h2 className="text-sm font-semibold text-amber-800 mb-2">Configuration warnings</h2>
          <ul className="space-y-1 text-sm text-amber-800">
            {otherWarnings.map((w, i) => <li key={i}>⚠ {w.message}</li>)}
          </ul>
        </div>
      )}

      {/* Hard reject rules */}
      <div className="card">
        <h2 className="section-title mb-3">Hard Reject Rules</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2">Field</th>
              <th className="py-2 pr-2">Operator</th>
              <th className="py-2 pr-2">Threshold</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {config.hardRejectRules.map((rule, i) => (
              <tr key={rule.id ?? i} className="border-t border-slate-100 align-top">
                <td className="py-2 pr-2">
                  <input className="input" value={rule.name} onChange={(e) => updateHardRule(i, { name: e.target.value })} />
                  {Number(rule.threshold) === 0 && (
                    <p className="mt-1 text-xs text-amber-600">Threshold 0 — rule effectively disabled.</p>
                  )}
                </td>
                <td className="py-2 pr-2 w-48">
                  <select className="input" value={rule.field} onChange={(e) => updateHardRule(i, { field: e.target.value })}>
                    {FIELD_OPTIONS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-2 w-24">
                  <select className="input" value={rule.operator} onChange={(e) => updateHardRule(i, { operator: e.target.value })}>
                    {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-2 w-32">
                  <input
                    type="number" step="any" className="input" value={rule.threshold}
                    onChange={(e) => updateHardRule(i, { threshold: Number(e.target.value) })}
                  />
                </td>
                <td className="py-2 text-right">
                  <button type="button" className="btn-danger" onClick={() => removeHardRule(i)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-secondary mt-3 text-sm" onClick={addHardRule}>+ Add Rule</button>
      </div>

      {/* Scoring weights */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Scoring Weights</h2>
          <span className={`chip ${sumOk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            Sum: {(weightSum * 100).toFixed(1)}% {sumOk ? '✓' : '→ auto-normalised on evaluation'}
          </span>
        </div>
        <div className="grid sm:grid-cols-5 gap-3">
          {Object.entries(config.scoringWeights).map(([key, w]) => (
            <div key={key}>
              <label className="label">{WEIGHT_LABELS[key] ?? key}</label>
              <input
                type="number" step="0.01" min="0" max="1" className="input"
                value={w}
                onChange={(e) =>
                  patch('scoringWeights', { ...config.scoringWeights, [key]: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-slate-400">{((Number(w) || 0) * 100).toFixed(0)}%</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-slate-100">
          {Object.values(config.scoringWeights).map((w, i) => (
            <div
              key={i}
              className={WEIGHT_COLORS[i % WEIGHT_COLORS.length]}
              style={{ width: `${weightSum > 0 ? ((Number(w) || 0) / weightSum) * 100 : 0}%` }}
            />
          ))}
        </div>
      </div>

      {/* Scoring thresholds */}
      <div className="card">
        <h2 className="section-title mb-3">Scoring Thresholds</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          {Object.entries(config.scoringThresholds).map(([key, value]) => (
            <div key={key}>
              <label className="label">{THRESHOLD_META[key]?.label ?? key}</label>
              <input
                type="number" step={THRESHOLD_META[key]?.step ?? 'any'} className="input"
                value={value}
                onChange={(e) =>
                  patch('scoringThresholds', { ...config.scoringThresholds, [key]: Number(e.target.value) })
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Score bands */}
      <div className="card">
        <h2 className="section-title mb-3">Score Bands (300–900)</h2>
        <BandEditor
          bands={config.scoreBands}
          onChange={(bands) => patch('scoreBands', bands)}
          warnings={bandWarnings}
        />
      </div>

      {/* Interaction rules */}
      <div className="card">
        <h2 className="section-title mb-3">Interaction Rules</h2>
        <div className="space-y-4">
          {config.interactionRules.map((rule, i) => (
            <RuleBuilder
              key={rule.id ?? i}
              rule={rule}
              onChange={(next) =>
                patch('interactionRules', config.interactionRules.map((r, j) => (j === i ? next : r)))
              }
              onDelete={() =>
                patch('interactionRules', config.interactionRules.filter((_, j) => j !== i))
              }
            />
          ))}
        </div>
        <button type="button" className="btn-secondary mt-4 text-sm" onClick={addInteractionRule}>
          + Add Interaction Rule
        </button>
      </div>

      {/* Saved configs */}
      <div className="card">
        <h2 className="section-title mb-3">Saved Configurations</h2>
        {savedConfigs.length === 0 ? (
          <p className="text-sm text-slate-400">
            {offline ? 'Backend offline — saved configs unavailable.' : 'No saved configs yet. Save the current editor state below.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {savedConfigs.map((sc) => (
              <li key={sc._id} className="py-2 flex items-center gap-3">
                <span className="font-medium text-sm flex-1">
                  {sc.name}
                  {sc.isActive && <span className="chip bg-indigo-100 text-indigo-700 ml-2">active</span>}
                </span>
                <span className="text-xs text-slate-400">{new Date(sc.createdAt).toLocaleString()}</span>
                <button className="btn-secondary text-xs" onClick={() => loadConfig(sc)}>Load</button>
                {!sc.isActive && (
                  <button className="btn-secondary text-xs" onClick={() => activateConfig(sc._id)}>Activate</button>
                )}
                <button className="btn-danger text-xs" onClick={() => deleteConfig(sc._id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          {dirty ? (
            <span className="chip bg-amber-100 text-amber-700">Unsaved changes</span>
          ) : (
            <span className="chip bg-emerald-100 text-emerald-700">Saved</span>
          )}
          <span className="text-xs text-slate-400">
            {warnings.length > 0 ? `${warnings.length} config warning(s)` : 'Config is clean'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <input
              className="input w-56"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Config name"
            />
            <button className="btn-primary" onClick={onSave} disabled={saving || !saveName.trim() || offline}>
              {saving ? 'Saving…' : 'Save & Activate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
