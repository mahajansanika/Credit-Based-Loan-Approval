/**
 * Linear interpolation between min and max with t clamped to [0, 1].
 * Used for ALL continuous score interpolations in the engine — no inline math.
 * @param {number} min - value returned when t <= 0
 * @param {number} max - value returned when t >= 1
 * @param {number} t - interpolation factor
 * @returns {number}
 */
export function lerp(min, max, t) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return min + (max - min) * clamped;
}

/**
 * Safe ratio helper for building lerp factors. Returns 0 when the
 * denominator is zero/negative (degenerate config) instead of NaN/Infinity.
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
export function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}
