/**
 * EMI calculator shown for Approved and Conditional decisions.
 * EMI = P × r × (1+r)^n / ((1+r)^n − 1); simple division when rate = 0.
 * Live affordability check against the applicant's monthly surplus.
 */
import { useState } from 'react';
import { formatCurrency } from '../utils/formatCurrency.js';

/** Affordability bands as fractions of monthly surplus. */
const SAFE_RATIO = 0.3;
const CAUTION_RATIO = 0.5;

function computeEmi(principal, annualRate, months) {
  if (months <= 0) return null;
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / months;
  const pow = Math.pow(1 + r, months);
  return (principal * r * pow) / (pow - 1);
}

function SliderRow({ label, value, onChange, min, max, step, format }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <input
          type="number"
          className="input w-32 text-right"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <input
        type="range"
        className="w-full accent-indigo-600"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="text-xs text-slate-400 mt-0.5">{format(value)}</p>
    </div>
  );
}

export default function EMICalculator({ income, expense }) {
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(14);
  const [tenure, setTenure] = useState(24);

  const surplus = income - expense;
  const tenureValid = tenure >= 3 && tenure <= 60;
  const emi = tenureValid ? computeEmi(principal, rate, tenure) : null;
  const total = emi !== null ? emi * tenure : null;
  const interest = total !== null ? total - principal : null;

  let tone = 'emerald';
  let verdict = '';
  if (emi !== null) {
    if (emi > income) {
      tone = 'red';
      verdict = 'EMI exceeds your total income. This loan is not feasible.';
    } else if (surplus <= 0) {
      tone = 'red';
      verdict = 'There is no monthly surplus — any EMI is unaffordable.';
    } else {
      const ratio = emi / surplus;
      tone = ratio < SAFE_RATIO ? 'emerald' : ratio <= CAUTION_RATIO ? 'amber' : 'red';
      verdict = `EMI of ${formatCurrency(emi)} is ${(ratio * 100).toFixed(1)}% of your monthly surplus of ${formatCurrency(surplus)}. This ${ratio <= CAUTION_RATIO ? 'is' : 'is not'} within a safe repayment range.`;
    }
  }
  const toneClasses = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  };

  return (
    <div className="space-y-4">
      <SliderRow
        label="Loan amount" value={principal} onChange={setPrincipal}
        min={10000} max={1000000} step={1000} format={formatCurrency}
      />
      <SliderRow
        label="Annual interest rate" value={rate} onChange={setRate}
        min={8} max={36} step={0.5} format={(v) => `${v.toFixed(1)}% p.a.${v === 0 ? ' (simple division)' : ''}`}
      />
      <SliderRow
        label="Tenure" value={tenure} onChange={setTenure}
        min={3} max={60} step={1} format={(v) => `${v} months`}
      />
      {!tenureValid && <p className="field-error">Tenure must be between 3 and 60 months.</p>}

      {emi !== null && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Monthly EMI</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(emi)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Total repayment</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(total)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Total interest</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(interest)}</p>
            </div>
          </div>
          <div className={`border rounded-lg p-3 text-sm ${toneClasses[tone]}`}>{verdict}</div>
        </>
      )}
    </div>
  );
}
