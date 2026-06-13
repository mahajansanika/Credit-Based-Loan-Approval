/**
 * Animated semicircular score gauge (300–900). Band segments are drawn from
 * the active config and colored by decision; the needle and counter animate
 * to the score with an ease-out tween.
 */
import { useEffect, useRef, useState } from 'react';

const DECISION_COLORS = {
  Approved: '#16a34a',
  Conditional: '#d97706',
  Rejected: '#dc2626',
};

function polar(cx, cy, r, deg) {
  const rad = ((deg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export default function ScoreMeter({ score, bands = [], size = 320, label }) {
  const [animated, setAnimated] = useState(300);
  const frame = useRef(null);

  useEffect(() => {
    if (typeof score !== 'number') return undefined;
    const from = animated;
    const to = score;
    const duration = 800;
    const startTime = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(Math.round(from + (to - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  if (typeof score !== 'number') {
    return (
      <div className="text-center py-6">
        <p className="text-4xl font-bold text-slate-300">—</p>
        <p className="text-sm text-slate-400 mt-1">No score — rejected before scoring</p>
      </div>
    );
  }

  const cx = 160, cy = 150, r = 120;
  const toDeg = (s) => ((Math.min(900, Math.max(300, s)) - 300) / 600) * 180;
  const needleDeg = toDeg(animated);
  const needleTip = polar(cx, cy, r - 26, needleDeg);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.56} viewBox="0 0 320 180">
        <path d={arcPath(cx, cy, r, 0, 180)} stroke="#e2e8f0" strokeWidth="18" fill="none" />
        {bands
          .filter((b) => typeof b.min === 'number' && typeof b.max === 'number')
          .map((b, i) => (
            <path
              key={i}
              d={arcPath(cx, cy, r, toDeg(b.min), toDeg(Math.min(b.max + 1, 900)))}
              stroke={DECISION_COLORS[b.decision] ?? '#94a3b8'}
              strokeWidth="18"
              fill="none"
              opacity="0.35"
            />
          ))}
        <path
          d={arcPath(cx, cy, r, 0, Math.max(needleDeg, 0.5))}
          stroke="#1e293b"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#1e293b" strokeWidth="3" />
        <circle cx={cx} cy={cy} r="6" fill="#1e293b" />
        <text x={cx} y={cy - 34} textAnchor="middle" fontSize="40" fontWeight="700" fill="#0f172a">
          {animated}
        </text>
        <text x="40" y="172" fontSize="11" fill="#94a3b8">300</text>
        <text x="268" y="172" fontSize="11" fill="#94a3b8">900</text>
      </svg>
      {label && <p className="text-sm font-medium text-slate-500 -mt-2">{label}</p>}
    </div>
  );
}
