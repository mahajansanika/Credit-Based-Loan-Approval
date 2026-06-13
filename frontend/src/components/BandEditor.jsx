/**
 * Score band table editor with live gap/overlap detection (warnings are
 * computed by validateConfig and passed in filtered by type).
 */
const DECISIONS = ['Approved', 'Conditional', 'Rejected'];
const DECISION_TONE = {
  Approved: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Conditional: 'text-amber-700 bg-amber-50 border-amber-200',
  Rejected: 'text-red-700 bg-red-50 border-red-200',
};

export default function BandEditor({ bands, onChange, warnings }) {
  const update = (index, key, value) => {
    const next = bands.map((b, i) => (i === index ? { ...b, [key]: value } : b));
    onChange(next);
  };
  const remove = (index) => onChange(bands.filter((_, i) => i !== index));
  const add = () =>
    onChange([...bands, { min: 300, max: 900, label: 'New band', decision: 'Conditional' }]);

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
            <th className="py-2 pr-2">Min</th>
            <th className="py-2 pr-2">Max</th>
            <th className="py-2 pr-2">Label</th>
            <th className="py-2 pr-2">Decision</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {bands.map((band, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="py-2 pr-2 w-24">
                <input
                  type="number"
                  className="input"
                  value={band.min}
                  onChange={(e) => update(i, 'min', Number(e.target.value))}
                />
              </td>
              <td className="py-2 pr-2 w-24">
                <input
                  type="number"
                  className="input"
                  value={band.max}
                  onChange={(e) => update(i, 'max', Number(e.target.value))}
                />
              </td>
              <td className="py-2 pr-2">
                <input
                  className="input"
                  value={band.label}
                  onChange={(e) => update(i, 'label', e.target.value)}
                />
              </td>
              <td className="py-2 pr-2 w-40">
                <select
                  className={`input border ${DECISION_TONE[band.decision] ?? ''}`}
                  value={band.decision}
                  onChange={(e) => update(i, 'decision', e.target.value)}
                >
                  {DECISIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 text-right">
                <button type="button" className="btn-danger" onClick={() => remove(i)} title="Remove band">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn-secondary mt-3 text-sm" onClick={add}>+ Add Band</button>
      {warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
