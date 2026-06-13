/**
 * Panel 4 — Conditional Resolver (inline on the result page). Shows the
 * points gap to Approved, ranked suggestions (easiest first, max 4),
 * ineffective changes, and a live what-if simulator that re-runs the
 * mirrored engine on every input change with an animated score meter.
 */
import { useState } from 'react';
import { useEngine } from '../hooks/useEngine.js';
import { formatPercent, formatCurrency } from '../utils/formatCurrency.js';
import ScoreMeter from '../components/ScoreMeter.jsx';
import SuggestionCard from '../components/SuggestionCard.jsx';

export default function ConditionalResolver({ applicant, config }) {
  const result = applicant.result;
  const analysis = result.conditionalAnalysis;
  const [simExpense, setSimExpense] = useState(applicant.inputs.monthly_expense);
  const [simLoans, setSimLoans] = useState(applicant.inputs.existing_loans);

  const simInputs = {
    ...applicant.inputs,
    monthly_expense: simExpense,
    existing_loans: simLoans,
  };
  const simResult = useEngine(simInputs, config, { simulation: true });

  if (!analysis) return null;

  const applyToSimulator = (changes) => {
    if (changes.monthly_expense !== undefined) setSimExpense(changes.monthly_expense);
    if (changes.existing_loans !== undefined) setSimLoans(changes.existing_loans);
    if (changes.monthly_income !== undefined) {
      // income changes are not simulator inputs; reflect expense/loans only
    }
    document.getElementById('live-simulator')?.scrollIntoView({ behavior: 'smooth' });
  };

  const crossed = simResult && simResult.decision === 'Approved';
  const delta = simResult && typeof simResult.finalScore === 'number' ? simResult.finalScore - result.finalScore : 0;

  return (
    <div className="card border-amber-300">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="section-title">Path to Approval</h2>
        <span className="chip bg-amber-100 text-amber-800">
          {analysis.gap} more point(s) needed to reach {analysis.targetScore} (Approved)
        </span>
      </div>

      {analysis.suggestions.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {analysis.suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} rank={i + 1} onTry={applyToSimulator} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No single simulated change reaches the approval threshold — combined, larger changes are required.
        </p>
      )}

      {analysis.ineffective.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold text-slate-700 text-sm mb-2">What won't work</h3>
          <div className="space-y-2">
            {analysis.ineffective.map((item, i) => (
              <div key={i} className="border border-slate-200 bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-slate-700">{item.title}</p>
                <p className="text-slate-600 mt-0.5">{item.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live simulator */}
      <div id="live-simulator" className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-700 mb-3">Live What-If Simulator</h3>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-700">Monthly expense</label>
                <input
                  type="number"
                  className="input w-36 text-right"
                  value={simExpense}
                  min={0}
                  max={applicant.inputs.monthly_income}
                  step={500}
                  onChange={(e) => setSimExpense(Number(e.target.value))}
                />
              </div>
              <input
                type="range"
                className="w-full accent-amber-600"
                value={simExpense}
                min={0}
                max={applicant.inputs.monthly_income}
                step={500}
                onChange={(e) => setSimExpense(Number(e.target.value))}
              />
              <p className="text-xs text-slate-400">
                Original: {formatCurrency(applicant.inputs.monthly_expense)} · income stays at{' '}
                {formatCurrency(applicant.inputs.monthly_income)}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-700">Existing loans</label>
                <input
                  type="number"
                  className="input w-36 text-right"
                  value={simLoans}
                  min={0}
                  max={10}
                  step={1}
                  onChange={(e) => setSimLoans(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <input
                type="range"
                className="w-full accent-amber-600"
                value={simLoans}
                min={0}
                max={Math.max(5, applicant.inputs.existing_loans)}
                step={1}
                onChange={(e) => setSimLoans(Number(e.target.value))}
              />
              <p className="text-xs text-slate-400">Original: {applicant.inputs.existing_loans}</p>
            </div>

            {simResult && (
              <div className="text-sm space-y-1">
                <p>
                  Simulated DTI:{' '}
                  <span className="font-semibold tabular-nums">
                    {simResult.derivedFields ? formatPercent(simResult.derivedFields.dti) : '—'}
                  </span>{' '}
                  · buffer:{' '}
                  <span className="font-semibold tabular-nums">
                    {simResult.derivedFields ? formatPercent(simResult.derivedFields.affordability_buffer) : '—'}
                  </span>
                </p>
                <p>
                  Interaction rules firing:{' '}
                  {simResult.firedInteractionRules.length === 0 ? (
                    <span className="text-emerald-600 font-medium">none</span>
                  ) : (
                    <span className="text-amber-700">
                      {simResult.firedInteractionRules.map((f) => f.rule.name).join(', ')}
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center">
            {simResult && (
              <>
                <ScoreMeter
                  score={simResult.finalScore}
                  bands={config.scoreBands}
                  size={260}
                  label={`${simResult.band?.label ?? ''} · ${delta >= 0 ? '+' : ''}${delta} vs original`}
                />
                <div
                  className={`mt-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                    crossed
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {crossed
                    ? '✓ These changes cross into Approved!'
                    : `Simulated decision: ${simResult.decision}`}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
