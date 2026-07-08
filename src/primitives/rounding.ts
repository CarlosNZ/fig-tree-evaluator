/**
 * Decimal-representation rounding ("rounding is decimal-safe" in
 * docs-dev/v3-specs/v3-implementation-notes.md, `round` in
 * docs-dev/v3-specs/v3-operator-parameters.md). Ties round HALF AWAY FROM ZERO
 * (the school rule, sign-symmetric): round(2.5)=3, round(-2.5)=-3 — not JS
 * `Math.round`, which rounds half toward +∞. Rounds the DECIMAL
 * representation, not `n * 10^d` float arithmetic, so round(1.005, 2)=1.01,
 * not 1. Negative `decimals` shift the same way: round(1234, -2)=1200. Assumes
 * finite input (the finite-number guard is the engine's result boundary, Phase
 * 4).
 */
export const roundDecimal = (value: number, decimals = 0): number => {
  if (!Number.isFinite(value)) return value
  const sign = value < 0 ? -1 : 1
  // Round the positive magnitude (Math.round is half-up there
  // = half-away-from-zero), shifting the decimal point via exponent strings
  // to dodge float representation error.
  const rounded = Math.round(shiftExponent(Math.abs(value), decimals))
  return sign * shiftExponent(rounded, -decimals)
}

/**
 * Multiply `num` by 10^exp by editing its exponent in string form, folding any
 * existing exponent (e.g. `1e-7`) in so the trick survives values JS already
 * prints in exponential notation.
 */
const shiftExponent = (num: number, exp: number): number => {
  const [mantissa, existing] = String(num).split('e')
  const shifted = existing !== undefined ? Number(existing) + exp : exp
  return Number(`${mantissa}e${shifted}`)
}
