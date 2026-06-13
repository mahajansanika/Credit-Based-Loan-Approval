/**
 * Bar chart of the five scoring components (raw 0–100) with a detail table
 * of weight, weighted contribution and the full quantified reason.
 */
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from 'recharts';

function barColor(score) {
  if (score >= 80) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

export default function ComponentBreakdown({ components }) {
  if (!components) return null;
  const data = Object.entries(components).map(([key, c]) => ({
    key,
    name: c.label,
    raw: Math.round(c.rawScore),
    weight: `${(c.weight * 100).toFixed(0)}%`,
    contribution: c.weightedContribution.toFixed(1),
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => [name === 'raw' ? `${value}/100` : value, name === 'raw' ? 'Component score' : name]}
          />
          <Bar dataKey="raw" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.key} fill={barColor(d.raw)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table className="w-full text-sm mt-2">
        <thead>
          <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
            <th className="py-1 pr-2">Component</th>
            <th className="py-1 pr-2">Score</th>
            <th className="py-1 pr-2">Weight</th>
            <th className="py-1 pr-2">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(components).map((c) => (
            <tr key={c.label} className="border-t border-slate-100 align-top">
              <td className="py-2 pr-2 font-medium whitespace-nowrap">{c.label}</td>
              <td className="py-2 pr-2 tabular-nums">{Math.round(c.rawScore)}/100</td>
              <td className="py-2 pr-2 tabular-nums">{(c.weight * 100).toFixed(0)}%</td>
              <td className="py-2 pr-2 tabular-nums">{c.weightedContribution.toFixed(1)}pts</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
