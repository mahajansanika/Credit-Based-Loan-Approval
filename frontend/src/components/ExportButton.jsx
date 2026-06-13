/**
 * PDF export — primary path posts to /api/export/pdf (server-side puppeteer)
 * and downloads the blob. If the server cannot render (no browser binary,
 * timeout after retry), falls back to client-side @react-pdf/renderer with a
 * summary document. Disabled when there is no result. Never fails silently.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { formatCurrency, formatPercent } from '../utils/formatCurrency.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Client-side fallback PDF via @react-pdf/renderer (lazy-loaded). */
async function clientSidePdf({ applicant, result }) {
  const { pdf, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');
  const React = await import('react');
  const e = React.createElement;

  const styles = StyleSheet.create({
    page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica' },
    h1: { fontSize: 18, marginBottom: 4 },
    muted: { color: '#64748b', fontSize: 9, marginBottom: 14 },
    h2: { fontSize: 13, marginTop: 14, marginBottom: 6 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderBottom: '1 solid #e2e8f0' },
    big: { fontSize: 26, marginTop: 8 },
    reason: { marginBottom: 4, color: '#334155' },
  });

  const rows = [
    ['Monthly income', formatCurrency(applicant.inputs.monthly_income)],
    ['Monthly expense', formatCurrency(applicant.inputs.monthly_expense)],
    ['Existing loans', String(applicant.inputs.existing_loans)],
    ['Credit history (months)', String(applicant.inputs.credit_history_months)],
    ['Defaults', String(applicant.inputs.defaults)],
    ['DTI', result.derivedFields ? formatPercent(result.derivedFields.dti) : '—'],
    ['Affordability buffer', result.derivedFields ? formatPercent(result.derivedFields.affordability_buffer) : '—'],
  ];

  const reasonItems = [
    ...(result.reasons?.hardRejectReasons ?? []),
    ...Object.values(result.reasons?.componentReasons ?? {}).map((c) => `${c.label}: ${c.reason}`),
    ...(result.reasons?.interactionReasons?.fired ?? []).map((f) => `${f.name}: ${f.reason}`),
  ];

  const doc = e(Document, null,
    e(Page, { size: 'A4', style: styles.page },
      e(Text, { style: styles.h1 }, 'Micro-Credit Approval Report'),
      e(Text, { style: styles.muted }, `Generated ${new Date().toLocaleString('en-IN')} — in-browser fallback export`),
      e(Text, { style: styles.big },
        typeof result.finalScore === 'number'
          ? `${result.finalScore}/900 — ${result.band?.label ?? ''} — ${result.decision}`
          : `Decision: ${result.decision}`),
      e(Text, { style: styles.h2 }, 'Applicant'),
      ...rows.map(([k, v], i) => e(View, { style: styles.row, key: i }, e(Text, null, k), e(Text, null, v))),
      e(Text, { style: styles.h2 }, 'Reasoning'),
      ...reasonItems.map((r, i) => e(Text, { style: styles.reason, key: i }, `• ${r}`)),
      e(Text, { style: styles.h2 }, 'Summary'),
      e(Text, null, result.reasons?.finalSummary ?? ''),
      e(Text, { style: { marginTop: 6, fontFamily: 'Helvetica-Bold' } }, result.reasons?.decisionReason ?? '')
    )
  );
  return pdf(doc).toBlob();
}

export default function ExportButton({ applicant, result, config }) {
  const [exporting, setExporting] = useState(false);
  const disabled = !result;

  const onExport = async () => {
    setExporting(true);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      const res = await api.post(
        '/export/pdf',
        { applicant, result, config },
        { responseType: 'blob', timeout: 90000, suppressToast: true }
      );
      download(res.data, `credit-report-${timestamp}.pdf`);
      toast.success('PDF report downloaded.');
    } catch (err) {
      console.warn('[export] server export failed, using in-browser fallback', err);
      try {
        const blob = await clientSidePdf({ applicant, result });
        download(blob, `credit-report-${timestamp}.pdf`);
        toast('Server export unavailable — generated a summary PDF in the browser.', { icon: '⚠️' });
      } catch (fallbackErr) {
        console.error('[export] fallback failed', fallbackErr);
        toast.error(`PDF export failed: ${err.response?.data?.message ?? err.message}`);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      className="btn-primary"
      onClick={onExport}
      disabled={disabled || exporting}
      title={disabled ? 'Run evaluation first' : 'Export full PDF report'}
    >
      {exporting ? 'Generating PDF (2–4s)…' : 'Export PDF Report'}
    </button>
  );
}
