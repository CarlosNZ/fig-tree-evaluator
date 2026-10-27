/*
Drawing helpers for the logo: tapered strokes along cubic Béziers, drawn as
filled outlines so every line can thin out along its length.
*/

export const f = (n) => +n.toFixed(2)
const rad = (d) => (d * Math.PI) / 180

const bez = (p, t) => {
  const u = 1 - t
  return [0, 1].map(
    (i) =>
      u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i]
  )
}
const dbez = (p, t) => {
  const u = 1 - t
  return [0, 1].map(
    (i) =>
      3 * u * u * (p[1][i] - p[0][i]) +
      6 * u * t * (p[2][i] - p[1][i]) +
      3 * t * t * (p[3][i] - p[2][i])
  )
}

// Highest and lowest y reached by a tapered stroke along the cubic `p`
export const yExtent = (p, w0, w1) => {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    const y = bez(p, t)[1]
    const half = (w0 + (w1 - w0) * t) / 2
    lo = Math.min(lo, y - half)
    hi = Math.max(hi, y + half)
  }
  return [lo, hi]
}

// Unit vector for a compass angle in degrees: 0 points up, 90 points right
export const dir = (deg) => [Math.sin(rad(deg)), -Math.cos(rad(deg))]

// Point on a circle's rim at a compass angle
export const rim = (centre, r, deg) => [
  centre[0] + Math.sin(rad(deg)) * r,
  centre[1] - Math.cos(rad(deg)) * r,
]

// Cubic from P to Q leaving along dirP and arriving along dirQ; k sets how
// long each end holds its direction, as a fraction of the straight-line
// distance
export const seg = (P, Q, dirP, dirQ, k = 0.38) => {
  const d = Math.hypot(Q[0] - P[0], Q[1] - P[1]) * k
  return [P, [P[0] + dirP[0] * d, P[1] + dirP[1] * d], [Q[0] - dirQ[0] * d, Q[1] - dirQ[1] * d], Q]
}

// Filled outline of a cubic whose width runs w0 → w1, optionally with round
// caps
export const taper = (p, w0, w1, { capStart = true, capEnd = true, ease = (t) => t } = {}) => {
  const n = 40
  const L = []
  const R = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const pt = bez(p, t)
    let d = dbez(p, t)
    if (Math.hypot(...d) < 1e-6) d = dbez(p, Math.min(Math.max(t, 0.01), 0.99))
    const len = Math.hypot(...d)
    const nx = -d[1] / len
    const ny = d[0] / len
    const w = (w0 + (w1 - w0) * ease(t)) / 2
    L.push([pt[0] + nx * w, pt[1] + ny * w])
    R.push([pt[0] - nx * w, pt[1] - ny * w])
  }
  const pts = [...L, ...R.reverse()]
  let out = `<path d="M${pts.map((q) => `${f(q[0])},${f(q[1])}`).join('L')}Z"/>`
  if (capStart) out += `<circle cx="${f(p[0][0])}" cy="${f(p[0][1])}" r="${f(w0 / 2)}"/>`
  if (capEnd) out += `<circle cx="${f(p[3][0])}" cy="${f(p[3][1])}" r="${f(w1 / 2)}"/>`
  return out
}

export const ring = (P, r, w) =>
  `<circle cx="${f(P[0])}" cy="${f(P[1])}" r="${f(
    r - w / 2
  )}" fill="none" stroke="currentColor" stroke-width="${f(w)}"/>`

export const dot = (P, r) => `<circle cx="${f(P[0])}" cy="${f(P[1])}" r="${f(r)}"/>`
