/**
 * Full layered reason panel: hard rejects → component reasons →
 * interaction reasons → final summary + decision line. Every entry carries
 * actual values and thresholds — never a bare label.
 */
export default function ReasonPanel({ result }) {
  const reasons = result?.reasons;
  if (!reasons) return null;

  return (
    <div className="space-y-4">
      {reasons.hardRejectReasons.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 text-sm mb-2">Hard rejection reasons</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-red-800">
            {reasons.hardRejectReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ol>
          {reasons.hardRejectSummary && (
            <p className="mt-3 text-sm font-semibold text-red-900">{reasons.hardRejectSummary}</p>
          )}
        </div>
      )}

      {reasons.componentReasons && (
        <div>
          <h3 className="font-semibold text-slate-700 text-sm mb-2">Component reasoning</h3>
          <ul className="space-y-2">
            {Object.values(reasons.componentReasons).map((c) => (
              <li key={c.label} className="text-sm text-slate-600 border-l-2 border-indigo-200 pl-3">
                <span className="font-medium text-slate-700">{c.label}:</span> {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reasons.interactionReasons.fired.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-700 text-sm mb-2">Interaction reasoning</h3>
          <ul className="space-y-2">
            {reasons.interactionReasons.fired.map((f, i) => (
              <li
                key={i}
                className={`text-sm border-l-2 pl-3 ${f.effect === 'penalty' ? 'border-red-300 text-red-700' : 'border-emerald-300 text-emerald-700'}`}
              >
                <span className="font-medium">{f.name} ({f.effect === 'penalty' ? '−' : '+'}{f.magnitude}):</span>{' '}
                {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-900 text-sm mb-1">Final summary</h3>
        <p className="text-sm text-indigo-900">{reasons.finalSummary}</p>
        <p className="text-sm font-semibold text-indigo-900 mt-2">{reasons.decisionReason}</p>
      </div>
    </div>
  );
}
