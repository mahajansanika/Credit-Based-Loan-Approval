/**
 * Self-contained HTML report for puppeteer PDF rendering. Four pages:
 * 1. Summary  2. Score breakdown  3. Reasoning  4. Rule config snapshot.
 * The score meter is inline SVG; if the score is null (pre-score reject)
 * a text block is rendered instead.
 */
import { formatCurrency, formatPercent } from '../utils/formatCurrency.js';

const DECISION_COLORS = {
  Approved: '#16a34a',
  Conditional: '#d97706',
  Rejected: '#dc2626',
  'Rejected (pre-score)': '#dc2626',
  Invalid: '#64748b',
};

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function polar(cx, cy, r, deg) {
  const rad = ((deg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Inline SVG semicircular score meter (300–900) with band-colored segments.
 */
function scoreMeterSvg(score, bands) {
  try {
    if (typeof score !== 'number') throw new Error('no score');
    const cx = 160, cy = 150, r = 120;
    const toDeg = (s) => ((Math.min(900, Math.max(300, s)) - 300) / 600) * 180;
    const segments = (bands ?? [])
      .filter((b) => typeof b.min === 'number' && typeof b.max === 'number')
      .map((b) => {
        const color = DECISION_COLORS[b.decision] ?? '#94a3b8';
        return `<path d="${arcPath(cx, cy, r, toDeg(b.min), toDeg(Math.min(b.max + 1, 900)))}" stroke="${color}" stroke-width="16" fill="none" stroke-linecap="butt" opacity="0.35"/>`;
      })
      .join('');
    const needleDeg = toDeg(score);
    const needleTip = polar(cx, cy, r - 24, needleDeg);
    return `<svg width="320" height="180" viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
      <path d="${arcPath(cx, cy, r, 0, 180)}" stroke="#e2e8f0" stroke-width="16" fill="none"/>
      ${segments}
      <path d="${arcPath(cx, cy, r, 0, Math.max(needleDeg, 0.5))}" stroke="#1e293b" stroke-width="6" fill="none" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${needleTip.x.toFixed(2)}" y2="${needleTip.y.toFixed(2)}" stroke="#1e293b" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="6" fill="#1e293b"/>
      <text x="${cx}" y="${cy - 30}" text-anchor="middle" font-size="34" font-weight="700" fill="#0f172a">${score}</text>
      <text x="40" y="172" font-size="11" fill="#64748b">300</text>
      <text x="268" y="172" font-size="11" fill="#64748b">900</text>
    </svg>`;
  } catch {
    return `<div style="font-size:40px;font-weight:700;">${typeof score === 'number' ? score : '—'}</div>`;
  }
}

function kvRow(label, value) {
  return `<tr><td class="k">${esc(label)}</td><td class="v">${esc(value)}</td></tr>`;
}

/**
 * Build the complete report HTML.
 * @param {{applicant: Object, result: Object, config: Object}} payload
 * @returns {string}
 */
export function buildReportHTML({ applicant, result, config }) {
  const inputs = applicant?.inputs ?? {};
  const derived = result?.derivedFields ?? applicant?.derivedFields ?? {};
  const decision = result?.decision ?? 'Unknown';
  const color = DECISION_COLORS[decision] ?? '#64748b';
  const reasons = result?.reasons ?? {};
  const components = result?.componentScores ?? null;
  const fired = result?.firedInteractionRules ?? [];
  const skipped = result?.skippedInteractionRules ?? [];
  const adjustment = result?.adjustment ?? null;
  const when = new Date().toLocaleString('en-IN');

  const componentRows = components
    ? Object.values(components)
        .map(
          (c) => `<tr>
            <td>${esc(c.label)}</td>
            <td>${Math.round(c.rawScore)}/100</td>
            <td>${(c.weight * 100).toFixed(0)}%</td>
            <td>${c.weightedContribution.toFixed(1)}pts</td>
            <td class="small">${esc(c.componentReason)}</td>
          </tr>`
        )
        .join('')
    : '';

  const firedRows = fired
    .map(
      (f) => `<tr>
        <td>${esc(f.rule.name)}</td>
        <td style="color:${f.rule.effect === 'penalty' ? '#dc2626' : '#16a34a'}">${f.rule.effect === 'penalty' ? '−' : '+'}${f.rule.magnitude}</td>
        <td class="small">${esc(f.resolvedReason)}</td>
      </tr>`
    )
    .join('');

  const hardRejectBlock = (reasons.hardRejectReasons ?? []).length
    ? `<div class="box red">
        <h3>Hard rejection reasons</h3>
        <ol>${reasons.hardRejectReasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
        <p><strong>${esc(reasons.hardRejectSummary ?? '')}</strong></p>
      </div>`
    : '';

  const suggestionsBlock = (result?.conditionalSuggestions ?? [])?.length
    ? `<h3>Conditional resolution suggestions</h3>
       <ol>${result.conditionalSuggestions
         .map((s) => `<li><strong>${esc(s.changeDescription)}</strong> → new score ${s.newScore} (+${s.pointsGained}). ${esc(s.reason)}</li>`)
         .join('')}</ol>`
    : '';

  const componentReasonItems = reasons.componentReasons
    ? Object.values(reasons.componentReasons)
        .map((c) => `<li><strong>${esc(c.label)}:</strong> ${esc(c.reason)}</li>`)
        .join('')
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
  .page { page-break-after: always; padding: 28px 36px; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 22px; }
  h3 { font-size: 13px; margin: 14px 0 6px; }
  .muted { color: #64748b; font-size: 11px; }
  .badge { display: inline-block; padding: 6px 16px; border-radius: 999px; color: #fff; font-weight: 700; font-size: 14px; background: ${color}; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
  td.k { width: 45%; color: #475569; }
  td.v { font-weight: 600; }
  .small { font-size: 10.5px; color: #475569; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-top: 10px; }
  .box.red { border-color: #fecaca; background: #fef2f2; }
  .box.green { border-color: #bbf7d0; background: #f0fdf4; }
  .center { text-align: center; }
  .score-line { font-size: 16px; font-weight: 700; margin-top: 6px; }
  ol li, ul li { margin-bottom: 5px; }
</style>
</head>
<body>

<!-- Page 1 — Summary -->
<div class="page">
  <h1>Micro-Credit Approval Report</h1>
  <div class="muted">Generated ${esc(when)} &middot; Rule config: ${esc(config?.name ?? applicant?.configName ?? 'Default')} &middot; Applicant: ${esc(applicant?.name ?? 'Applicant')}</div>
  <div class="center" style="margin-top:18px;">
    ${scoreMeterSvg(result?.finalScore, config?.scoreBands)}
    <div class="score-line">${typeof result?.finalScore === 'number' ? `Final score: ${result.finalScore}/900 — ${esc(result?.band?.label ?? '')}` : 'No score — rejected before scoring'}</div>
    <div style="margin-top:10px;"><span class="badge">${esc(decision)}</span></div>
  </div>
  <h2>Applicant inputs</h2>
  <table>
    ${kvRow('Monthly income', formatCurrency(inputs.monthly_income))}
    ${kvRow('Monthly expense', formatCurrency(inputs.monthly_expense))}
    ${kvRow('Existing loans', inputs.existing_loans ?? '—')}
    ${kvRow('Credit history (months)', inputs.credit_history_months ?? '—')}
    ${kvRow('Defaults', inputs.defaults ?? '—')}
    ${kvRow('DTI (derived)', derived.dti != null ? formatPercent(derived.dti) : '—')}
    ${kvRow('Affordability buffer (derived)', derived.affordability_buffer != null ? formatPercent(derived.affordability_buffer) : '—')}
  </table>
</div>

<!-- Page 2 — Score breakdown -->
<div class="page">
  <h1>Score Breakdown</h1>
  ${
    components
      ? `<h2>Scoring components</h2>
        <table>
          <tr><th>Component</th><th>Score</th><th>Weight</th><th>Contribution</th><th>Reason</th></tr>
          ${componentRows}
        </table>
        <h2>Interaction rules</h2>
        ${fired.length ? `<table><tr><th>Rule</th><th>Effect</th><th>Reason</th></tr>${firedRows}</table>` : '<p class="muted">No interaction rules fired.</p>'}
        ${skipped.length ? `<p class="small">Rules evaluated but not triggered: ${skipped.map((s) => esc(s.rule.name)).join(', ')}.</p>` : ''}
        <h2>Net adjustment breakdown</h2>
        <table>
          ${kvRow('Base score', adjustment?.baseScore ?? '—')}
          ${kvRow('Total penalties', `−${adjustment?.totalPenalty ?? 0}`)}
          ${kvRow('Total offsets', `+${adjustment?.totalOffset ?? 0}`)}
          ${kvRow('Net adjustment', `${(adjustment?.netAdjustment ?? 0) >= 0 ? '+' : ''}${adjustment?.netAdjustment ?? 0}`)}
          ${kvRow('Final score (clamped 300–900)', adjustment?.finalScore ?? '—')}
        </table>`
      : '<p class="muted">Scoring was not run — the application was rejected before scoring.</p>'
  }
</div>

<!-- Page 3 — Reasoning -->
<div class="page">
  <h1>Reasoning</h1>
  ${hardRejectBlock}
  ${componentReasonItems ? `<h3>Component reasons</h3><ul>${componentReasonItems}</ul>` : ''}
  ${(reasons.interactionReasons?.fired ?? []).length ? `<h3>Interaction reasons</h3><ul>${reasons.interactionReasons.fired.map((f) => `<li><strong>${esc(f.name)}</strong> (${f.effect === 'penalty' ? '−' : '+'}${f.magnitude}): ${esc(f.reason)}</li>`).join('')}</ul>` : ''}
  <div class="box green">
    <h3>Final summary</h3>
    <p>${esc(reasons.finalSummary ?? '')}</p>
    <p><strong>${esc(reasons.decisionReason ?? '')}</strong></p>
  </div>
  ${suggestionsBlock}
</div>

<!-- Page 4 — Rule config snapshot -->
<div class="page">
  <h1>Rule Config Snapshot</h1>
  <div class="muted">Configuration in effect at the time of evaluation: ${esc(config?.name ?? 'Default')}</div>
  <h2>Hard reject rules</h2>
  <table>
    <tr><th>Rule</th><th>Field</th><th>Operator</th><th>Threshold</th></tr>
    ${(config?.hardRejectRules ?? []).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.field)}</td><td>${esc(r.operator)}</td><td>${esc(r.threshold)}</td></tr>`).join('')}
  </table>
  <h2>Score bands</h2>
  <table>
    <tr><th>Min</th><th>Max</th><th>Label</th><th>Decision</th></tr>
    ${(config?.scoreBands ?? []).map((b) => `<tr><td>${b.min}</td><td>${b.max}</td><td>${esc(b.label)}</td><td>${esc(b.decision)}</td></tr>`).join('')}
  </table>
  <h2>Scoring weights</h2>
  <table>
    ${Object.entries(config?.scoringWeights ?? {}).map(([k, w]) => kvRow(k, `${(Number(w) * 100).toFixed(0)}%`)).join('')}
  </table>
  <h2>Scoring thresholds</h2>
  <table>
    ${Object.entries(config?.scoringThresholds ?? {}).map(([k, v]) => kvRow(k, v)).join('')}
  </table>
  <h2>Interaction rules</h2>
  <table>
    <tr><th>Rule</th><th>Logic</th><th>Conditions</th><th>Effect</th><th>Magnitude</th></tr>
    ${(config?.interactionRules ?? []).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.logic)}</td><td class="small">${(r.conditions ?? []).map((c) => `${esc(c.field)} ${esc(c.operator)} ${esc(c.threshold)}`).join(' · ')}</td><td>${esc(r.effect)}</td><td>${r.magnitude}</td></tr>`).join('')}
  </table>
</div>

</body>
</html>`;
}
