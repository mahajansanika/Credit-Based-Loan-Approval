/**
 * Panel 5 — Portfolio risk view. Summary metric cards, risk distribution
 * chart, sortable/filterable applicant table (row click → full result),
 * batch upload (CSV/Excel) with progress, and CSV download of results.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useConfig } from '../hooks/useConfig.js';
import { formatPercent, formatCurrency } from '../utils/formatCurrency.js';
import PortfolioChart from '../components/PortfolioChart.jsx';
import FileUpload from '../components/FileUpload.jsx';

const COLUMNS = [
  { key: 'name', label: 'Applicant', value: (a) => a.name },
  { key: 'income', label: 'Income', value: (a) => a.inputs?.monthly_income ?? 0 },
  { key: 'dti', label: 'DTI', value: (a) => a.derivedFields?.dti ?? -1 },
  { key: 'score', label: 'Score', value: (a) => a.result?.finalScore ?? -1 },
  { key: 'band', label: 'Band', value: (a) => a.result?.band?.label ?? 'zz-none' },
  { key: 'decision', label: 'Decision', value: (a) => a.result?.decision ?? '' },
  { key: 'date', label: 'Date', value: (a) => a.createdAt ?? '' },
];

const DECISION_CHIP = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Conditional: 'bg-amber-100 text-amber-700',
  Rejected: 'bg-red-100 text-red-700',
  'Rejected (pre-score)': 'bg-red-100 text-red-700',
};

function toCsv(applicants) {
  const header = [
    'id', 'name', 'monthly_income', 'monthly_expense', 'existing_loans',
    'credit_history_months', 'defaults', 'dti', 'affordability_buffer',
    'base_score', 'net_adjustment', 'final_score', 'band', 'decision', 'evaluated_at',
  ];
  const rows = applicants.map((a) =>
    [
      a._id, `"${(a.name ?? '').replace(/"/g, '""')}"`,
      a.inputs?.monthly_income ?? '', a.inputs?.monthly_expense ?? '', a.inputs?.existing_loans ?? '',
      a.inputs?.credit_history_months ?? '', a.inputs?.defaults ?? '',
      a.derivedFields?.dti != null ? (a.derivedFields.dti * 100).toFixed(1) + '%' : '',
      a.derivedFields?.affordability_buffer != null ? (a.derivedFields.affordability_buffer * 100).toFixed(1) + '%' : '',
      a.result?.baseScore ?? '', a.result?.netAdjustment ?? '', a.result?.finalScore ?? '',
      a.result?.band?.label ?? '', a.result?.decision ?? '', a.createdAt ?? '',
    ].join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export default function Portfolio() {
  const navigate = useNavigate();
  const { config } = useConfig();
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [batchRunning, setBatchRunning] = useState(false);

  const load = () => {
    api
      .get('/portfolio', { suppressToast: true })
      .then((res) => {
        setData(res.data);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  };
  useEffect(load, []);

  const applicants = data?.applicants ?? [];

  const filtered = useMemo(() => {
    let list = applicants;
    if (filter !== 'All') {
      list = list.filter((a) =>
        filter === 'Rejected'
          ? String(a.result?.decision ?? '').startsWith('Rejected')
          : a.result?.decision === filter
      );
    }
    const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[6];
    return [...list].sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [applicants, filter, sort]);

  const onBatch = async (rows, errors) => {
    setBatchRunning(true);
    try {
      const res = await api.post('/evaluate/batch', { applicants: rows, config });
      const { evaluated, failed, message } = res.data;
      if (evaluated === 0) {
        toast.error(message ?? 'No valid applicants found in file.');
      } else {
        toast.success(`Batch complete: ${evaluated} evaluated${failed ? `, ${failed} row(s) skipped` : ''}.`);
        if (res.data.errors?.length) {
          res.data.errors.slice(0, 3).forEach((e) => toast(`Row ${e.row}: skipped (invalid input)`, { icon: '⚠️' }));
        }
        load();
      }
      if (errors?.length) errors.slice(0, 3).forEach((e) => toast(e, { icon: '📄' }));
    } finally {
      setBatchRunning(false);
    }
  };

  const onSingleParsed = (fields) => {
    // Single-row file dropped on the portfolio batch zone — treat as a batch of one.
    onBatch([fields], []);
  };

  const downloadCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setSortKey = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));

  if (offline) {
    return (
      <div className="card text-center py-12">
        <p className="text-slate-600">Portfolio requires the backend API (port 5000).</p>
        <button className="btn-primary mt-4" onClick={load}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return <div className="card text-center py-12 text-slate-400 animate-pulse">Loading portfolio…</div>;
  }

  const { summary } = data;

  if (summary.total === 0) {
    return (
      <div className="space-y-6">
        <h1 className="section-title">Portfolio Risk View</h1>
        <div className="card text-center py-14">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-slate-600 font-medium">No applicants evaluated yet.</p>
          <p className="text-sm text-slate-400 mt-1">Evaluate your first applicant or upload a batch file below.</p>
          <Link to="/" className="btn-primary mt-4">Evaluate first applicant</Link>
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Batch evaluation</h2>
          <FileUpload onParsed={onSingleParsed} onBatch={onBatch} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Portfolio Risk View</h1>
        <button className="btn-secondary text-sm" onClick={downloadCsv}>Download results CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total applicants</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{summary.total}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Approval rate</p>
          <p className="text-3xl font-bold tabular-nums mt-1 text-emerald-600">
            {formatPercent(summary.approvalRate, 0)}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Average score</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{summary.averageScore ?? '—'}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Average DTI</p>
          <p className="text-3xl font-bold tabular-nums mt-1">
            {summary.averageDti != null ? formatPercent(summary.averageDti) : '—'}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card">
          <h2 className="section-title mb-2">Risk distribution</h2>
          <PortfolioChart applicants={applicants} />
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="section-title">Applicants</h2>
            <select className="input w-44 ml-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option>All</option>
              <option>Approved</option>
              <option>Conditional</option>
              <option>Rejected</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className="py-2 pr-3 cursor-pointer select-none hover:text-slate-700"
                      onClick={() => setSortKey(c.key)}
                    >
                      {c.label} {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a._id}
                    className="border-t border-slate-100 hover:bg-indigo-50 cursor-pointer"
                    onClick={() => navigate(`/result/${a._id}`)}
                  >
                    <td className="py-2 pr-3 font-medium">{a.name}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatCurrency(a.inputs?.monthly_income)}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {a.derivedFields?.dti != null ? formatPercent(a.derivedFields.dti) : '—'}
                    </td>
                    <td className="py-2 pr-3 font-bold tabular-nums">{a.result?.finalScore ?? '—'}</td>
                    <td className="py-2 pr-3">{a.result?.band?.label ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`chip ${DECISION_CHIP[a.result?.decision] ?? 'bg-slate-100 text-slate-600'}`}>
                        {a.result?.decision}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">
                      {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-6">No applicants match this filter.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-1">Batch evaluation</h2>
        <p className="text-sm text-slate-500 mb-3">
          Upload a CSV or Excel file with one applicant per row — invalid rows are skipped and flagged, the rest are
          evaluated and added to the portfolio.
        </p>
        {batchRunning ? (
          <div className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center">
            <p className="text-indigo-600 font-medium animate-pulse">Evaluating batch…</p>
          </div>
        ) : (
          <FileUpload onParsed={onSingleParsed} onBatch={onBatch} />
        )}
      </div>
    </div>
  );
}
