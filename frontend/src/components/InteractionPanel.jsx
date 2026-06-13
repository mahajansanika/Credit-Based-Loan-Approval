/**
 * Shows interaction rules that fired (with effect, magnitude, interpolated
 * reason and per-condition pass/fail chips) and, for transparency, the
 * rules that were evaluated but did not trigger.
 */
import { FIELD_LABELS } from '../engine/engine.js';

function ConditionChips({ conditionResults }) {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {conditionResults.map(({ condition, passed }, i) => (
        <span
          key={i}
          className={`chip ${passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
        >
          {passed ? '✓' : '✗'} {FIELD_LABELS[condition.field] ?? condition.field} {condition.operator}{' '}
          {condition.threshold}
        </span>
      ))}
    </div>
  );
}

export default function InteractionPanel({ fired = [], skipped = [] }) {
  return (
    <div className="space-y-3">
      {fired.length === 0 ? (
        <p className="text-sm text-slate-500">No interaction rules fired.</p>
      ) : (
        fired.map((f, i) => (
          <div
            key={i}
            className={`border rounded-lg p-3 ${f.rule.effect === 'penalty' ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{f.rule.name}</span>
              <span className={`chip ${f.rule.effect === 'penalty' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {f.rule.effect === 'penalty' ? '−' : '+'}{f.rule.magnitude} pts · {f.rule.logic}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">{f.resolvedReason}</p>
            <ConditionChips conditionResults={f.conditionResults} />
          </div>
        ))
      )}

      {skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            {skipped.length} rule(s) evaluated but not triggered
          </summary>
          <div className="mt-2 space-y-2">
            {skipped.map((s, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{s.rule.name}</span>
                  <span className="chip bg-slate-100 text-slate-500">
                    would apply {s.rule.effect === 'penalty' ? '−' : '+'}{s.rule.magnitude} · {s.rule.logic}
                  </span>
                </div>
                <ConditionChips conditionResults={s.conditionResults} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
