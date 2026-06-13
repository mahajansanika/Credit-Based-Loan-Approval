/**
 * Interaction rule editor — name, AND/OR/MAJORITY logic, condition builder
 * (field + operator + threshold rows), penalty/offset effect, magnitude,
 * and reason template with token hints.
 */
import { FIELD_LABELS } from '../engine/engine.js';

const FIELD_OPTIONS = Object.keys(FIELD_LABELS);
const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'eq', label: '=' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'neq', label: '≠' },
];

export default function RuleBuilder({ rule, onChange, onDelete }) {
  const update = (patch) => onChange({ ...rule, ...patch });
  const updateCondition = (index, patch) =>
    update({
      conditions: rule.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  const addCondition = () =>
    update({ conditions: [...rule.conditions, { field: 'dti', operator: 'gt', threshold: 0.5 }] });
  const removeCondition = (index) =>
    update({ conditions: rule.conditions.filter((_, i) => i !== index) });

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <input
          className="input flex-1 font-medium"
          value={rule.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Rule name"
        />
        <select
          className="input w-32"
          value={rule.logic}
          onChange={(e) => update({ logic: e.target.value })}
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
          <option value="MAJORITY">MAJORITY</option>
        </select>
        <button type="button" className="btn-danger" onClick={onDelete} title="Delete rule">×</button>
      </div>

      <div className="space-y-2">
        {rule.conditions.map((condition, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className="input flex-1"
              value={condition.field}
              onChange={(e) => updateCondition(i, { field: e.target.value })}
            >
              {FIELD_OPTIONS.map((f) => (
                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
              ))}
            </select>
            <select
              className="input w-20"
              value={condition.operator}
              onChange={(e) => updateCondition(i, { operator: e.target.value })}
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              className="input w-28"
              value={condition.threshold}
              onChange={(e) => updateCondition(i, { threshold: Number(e.target.value) })}
            />
            <button type="button" className="btn-danger" onClick={() => removeCondition(i)} title="Remove condition">×</button>
          </div>
        ))}
        <button type="button" className="btn-secondary text-xs" onClick={addCondition}>+ Add Condition</button>
      </div>

      <div className="flex items-center gap-3">
        <select
          className={`input w-32 ${rule.effect === 'penalty' ? 'text-red-700' : 'text-emerald-700'}`}
          value={rule.effect}
          onChange={(e) => update({ effect: e.target.value })}
        >
          <option value="penalty">penalty</option>
          <option value="offset">offset</option>
        </select>
        <input
          type="number"
          className="input w-28"
          value={rule.magnitude}
          onChange={(e) => update({ magnitude: Number(e.target.value) })}
          placeholder="points"
        />
        <span className="text-xs text-slate-400">points {rule.effect === 'penalty' ? 'subtracted' : 'added'}</span>
      </div>

      <div>
        <input
          className="input"
          value={rule.reason}
          onChange={(e) => update({ reason: e.target.value })}
          placeholder="Reason template"
        />
        <p className="mt-1 text-xs text-slate-400">
          Tokens: {'{field:monthly_income}'}, {'{field:dti}'}, {'{threshold}'}, {'{magnitude}'} — interpolated with actual values.
        </p>
      </div>
    </div>
  );
}
