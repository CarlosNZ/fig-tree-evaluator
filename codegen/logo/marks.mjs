/*
The two drawings: the tree graph that leads into the wordmark, and the
stand-alone icon.

Both are a root ring with three tapered arms, each ending in a ring. In the
lockup, each arm ends at the start of one line of the wordmark, so the lines are
the tree's leaves. Rings are stroked with currentColor and everything else takes
the fill, so a wrapping element sets both colours.
*/

import { taper, seg, dir, rim, ring, dot, f } from './geometry.mjs'

// Wordmark grid, in lockup units: the left edge of fig / tree / evaluator, and
// the three baselines
export const COLUMN = 400
export const BASELINES = [40, 88, 136]

const NODE = { r: 9.5, w: 4.5, gap: 8 }
const ROOT = { r: 20, w: 8 }

// `starts` is the x where each line begins and `middles` the y of each line's
// lowercase middle, where its node sits; `reach` is the root's distance from
// the middle node. Returns the drawing and its left, top and bottom edges.
export const lockupGraph = (starts, middles, reach) => {
  const nodes = starts.map((x, i) => [x - NODE.gap - NODE.r, middles[i]])
  const R = [nodes[1][0] - reach, middles[1]]
  // Edges run from the root's rim to each ring's outer edge, so no line enters
  // a ring
  const into = (n) => [n[0] - NODE.r + 0.5, n[1]]
  const from = (deg) => rim(R, ROOT.r - 0.5, deg)
  const opt = { capStart: false, capEnd: false }
  let s = ''
  s += taper(seg(from(90), into(nodes[1]), dir(90), dir(90), 0.4), ROOT.w * 0.8, NODE.w, opt)
  s += taper(seg(from(46), into(nodes[0]), dir(46), dir(90), 0.42), ROOT.w, NODE.w, opt)
  s += taper(seg(from(134), into(nodes[2]), dir(134), dir(90), 0.42), ROOT.w, NODE.w, opt)
  s += `<g class="nodes">${nodes.map((n) => ring(n, NODE.r, NODE.w)).join('')}</g>`
  s += `<g class="root">${ring(R, ROOT.r, ROOT.w)}</g>`
  return {
    body: `<g class="arms">${s}</g>`,
    left: R[0] - ROOT.r,
    top: Math.min(R[1] - ROOT.r, ...nodes.map((n) => n[1] - NODE.r)),
    bottom: Math.max(R[1] + ROOT.r, ...nodes.map((n) => n[1] + NODE.r)),
  }
}

// The icon on a 200 grid. Its node stagger copies the wordmark's ragged left
// edge: the middle line starts nearest the root, the top line further out, the
// bottom line furthest.
const ICON = {
  root: [50, 100],
  rootR: 25,
  rootW: 10,
  nodeR: 15.5,
  nodeW: 7,
  nodes: [
    [130, 40],
    [108, 100],
    [152, 160],
  ],
  leave: [22, 90, 158], // departure angles from the root; steep top and bottom squares the icon up
  k: 0.5,
}

// The cut for 24px and below: solid nodes, where rings would blur, and arms
// and root ring heavy enough to stay over a pixel wide at 16px, where one pixel
// is about 10 units of the fitted drawing
const SMALL = { armStart: 14, armEnd: 12.5, rootW: 15 }

const iconBody = (small) => {
  const { root, rootR, rootW, nodeR, nodeW, nodes, leave, k } = ICON
  let s = ''
  nodes.forEach((n, i) => {
    const a = leave[i]
    const P = rim(root, rootR - 0.5, a)
    const Q = small ? n : [n[0] - nodeR + 0.5, n[1]]
    s += taper(
      seg(P, Q, dir(a), dir(90), i === 1 ? 0.4 : k),
      small ? SMALL.armStart : (i === 1 ? 0.85 : 1) * rootW,
      small ? SMALL.armEnd : nodeW,
      { capStart: false, capEnd: false }
    )
  })
  s += `<g class="nodes">${
    small
      ? nodes.map((n) => dot(n, nodeR + 1.5)).join('')
      : nodes.map((n) => ring(n, nodeR, nodeW)).join('')
  }</g>`
  s += `<g class="root">${ring(root, rootR, small ? SMALL.rootW : rootW)}</g>`
  return `<g class="arms">${s}</g>`
}

// The drawing's extent for a cut; the small cut's solid nodes reach further
// than the rings
const extent = (small) => {
  const nodeR = small ? ICON.nodeR + 1.5 : ICON.nodeR
  const xs = [ICON.root[0] - ICON.rootR, ...ICON.nodes.map((n) => n[0] + nodeR)]
  const ys = ICON.nodes.flatMap((n) => [n[1] - nodeR, n[1] + nodeR])
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  }
}

// Width and height of the drawing as icon() places it, centred on (100, 100)
export const iconSize = ({ small = false } = {}) => {
  const { w, h } = extent(small)
  return { w, h }
}

// The icon centred on (100, 100) of its 200 grid
export const icon = ({ small = false } = {}) => {
  const { cx, cy } = extent(small)
  return `<g transform="translate(${f(100 - cx)} ${f(100 - cy)})">${iconBody(small)}</g>`
}
