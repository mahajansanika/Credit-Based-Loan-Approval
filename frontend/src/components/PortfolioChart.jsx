/**
 * Risk distribution pie chart — applicant count per score band, colored by
 * the band's decision (green Approved / amber Conditional / red Rejected).
 */
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const DECISION_COLORS = {
  Approved: '#16a34a',
  Conditional: '#d97706',
  Rejected: '#dc2626',
};

export default function PortfolioChart({ applicants }) {
  const counts = new Map();
  for (const a of applicants) {
    const label = a.result?.band?.label ?? 'Pre-score reject';
    const decision = String(a.result?.decision ?? 'Rejected').startsWith('Rejected')
      ? 'Rejected'
      : a.result?.decision;
    const key = `${label}|${decision}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const data = [...counts.entries()].map(([key, value]) => {
    const [label, decision] = key.split('|');
    return { name: label, value, decision };
  });

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">No data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={i} fill={DECISION_COLORS[d.decision] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name, entry) => [`${value} applicant(s)`, `${name} (${entry.payload.decision})`]} />
        <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
