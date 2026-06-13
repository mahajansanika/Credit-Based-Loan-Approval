/**
 * Panel 3 — Result. Animated score meter, metric cards, decision badge,
 * layered reason panel, component breakdown, interaction panel, EMI
 * calculator (Approved/Conditional) and PDF export. When the decision is
 * Conditional, the ConditionalResolver (Panel 4) renders below.
 */
import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useConfig } from '../hooks/useConfig.js';
import ScoreMeter from '../components/ScoreMeter.jsx';
import ComponentBreakdown from '../components/ComponentBreakdown.jsx';
import InteractionPanel from '../components/InteractionPanel.jsx';
import ReasonPanel from '../components/ReasonPanel.jsx';
import EMICalculator from '../components/EMICalculator.jsx';
import ExportButton from '../components/ExportButton.jsx';
import ConditionalResolver from './ConditionalResolver.jsx';

const DECISION_BADGE = {
  Approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Conditional: 'bg-amber-100 text-amber-800 border-amber-300',
  Rejected: 'bg-red-100 text-red-800 border-red-300',
  'Rejected (pre-score)': 'bg-red-100 text-red-800 border-red-300',
};

export default function Result() {
  const { id } = useParams();
  const location = useLocation();
  const { config } = useConfig();
  const [applicant, setApplicant] = useState(location.state?.applicant ?? null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (applicant || id === 'local') return;
    api
      .get(`/portfolio/${id}`)
      .then((res) => setApplicant(res.data.applicant))
      .catch(() => setError('Could not load this result.'));
  }, [id, applicant]);

  if (error || (id === 'local' && !applicant)) {
    return (
      <div className="card text-center py-12">
        <p className="text-slate-600">{error ?? 'This locally evaluated result has expired.'}</p>
        <Link to="/" className="btn-primary mt-4">Evaluate an applicant</Link>
      </div>
    );
  }
  if (!applicant) {
    return <div className="card text-center py-12 text-slate-400 animate-pulse">Loading result…</div>;
  }

  const result = applicant.result;
  const showEmi = result.decision === 'Approved' || result.decision === 'Conditional';
  const badge = DECISION_BADGE[result.decision] ?? 'bg-slate-100 text-slate-700 border-slate-300';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="section-title">{applicant.name}</h1>
          <p className="text-xs text-slate-400">
            Evaluated {new Date(applicant.createdAt).toLocaleString()} · config: {applicant.configName}
          </p>
        </div>
        <span className={`ml-auto px-4 py-1.5 rounded-full border font-semibold text-sm ${badge}`}>
          {result.decision}
        </span>
        <ExportButton applicant={applicant} result={result} config={config} />
      </div>

      {result.band?.warning && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
          ⚠ {result.band.warning}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card flex flex-col items-center justify-center">
          <ScoreMeter
            score={result.finalScore}
            bands={config.scoreBands}
            label={result.band ? `${result.band.label} band` : undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="card text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Final score</p>
            <p className="text-3xl font-bold tabular-nums mt-1">{result.finalScore ?? '—'}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Base score</p>
            <p className="text-3xl font-bold tabular-nums mt-1">{result.baseScore ?? '—'}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Net adjustment</p>
            <p
              className={`text-3xl font-bold tabular-nums mt-1 ${
                (result.netAdjustment ?? 0) < 0 ? 'text-red-600' : (result.netAdjustment ?? 0) > 0 ? 'text-emerald-600' : ''
              }`}
            >
              {result.netAdjustment !== null
                ? `${result.netAdjustment >= 0 ? '+' : ''}${result.netAdjustment}`
                : '—'}
            </p>
            {result.adjustment && (
              <p className="text-xs text-slate-400 mt-1">
                −{result.adjustment.totalPenalty} / +{result.adjustment.totalOffset}
              </p>
            )}
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Band</p>
            <p className="text-2xl font-bold mt-1">{result.band?.label ?? '—'}</p>
            {result.band?.min !== null && result.band && (
              <p className="text-xs text-slate-400 mt-1">{result.band.min}–{result.band.max}</p>
            )}
          </div>
        </div>
      </div>

      {result.componentScores && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="section-title mb-3">Score Components</h2>
            <ComponentBreakdown components={result.componentScores} />
          </div>
          <div className="card">
            <h2 className="section-title mb-3">Interaction Rules</h2>
            <InteractionPanel fired={result.firedInteractionRules} skipped={result.skippedInteractionRules} />
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-3">Reasoning</h2>
        <ReasonPanel result={result} />
      </div>

      {result.decision === 'Conditional' && (
        <ConditionalResolver applicant={applicant} config={config} />
      )}

      {showEmi && (
        <div className="card">
          <h2 className="section-title mb-3">EMI Calculator</h2>
          <EMICalculator
            income={applicant.inputs.monthly_income}
            expense={applicant.inputs.monthly_expense}
          />
        </div>
      )}
    </div>
  );
}
