/**
 * Lays out an `<ExpressionTree>` in the browser. The server renders the tree
 * as nested lists, which CSS draws as a plain diagram where every subtree
 * takes a column of its own. This measures each entry and places it with a
 * tidy-tree layout (Reingold–Tilford): siblings are packed by their outlines
 * level by level, so a short branch sits beside a deep one rather than past
 * its whole width, and each parent is centred over its children. Connectors
 * are drawn as one SVG, and the data box goes into the first empty corner, or
 * the figure's bottom-left, unless the page placed it.
 */

/** One entry: its label-and-box unit, and the entries below it. */
interface Entry {
  unit: HTMLElement
  width: number
  height: number
  depth: number
  children: Entry[]
  /** Each child's centre, relative to this entry's centre. */
  offsets: number[]
  /** This entry's centre, from the tree's left edge once placed. */
  x: number
}

/** Left and right edges per level, relative to an entry's centre. */
interface Outline {
  left: number[]
  right: number[]
}

// Spacing, all in rem, for hand-tuning
/** Between sibling entries */
const TREE_HORIZONTAL_SPACING = 2.5
/** Between rows, where the connectors run */
const TREE_VERTICAL_SPACING = 1.75
/** The data box from the left or right edge of its corner */
const DATA_HORIZONTAL_INSET = 1
/** The data box from the top or bottom edge of its corner */
const DATA_VERTICAL_INSET = 0
/** Between the data box and the tree, where it sits beside the tree */
const DATA_TREE_SPACING = 1.5
/** The least space around the data box when it sits in the tree's corner */
const DATA_CLEARANCE = 0.5

const SVG = 'http://www.w3.org/2000/svg'

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize)

const read = (li: HTMLElement, depth: number): Entry => {
  const unit = li.querySelector<HTMLElement>(':scope > .fds-tree-unit')!
  const { width, height } = unit.getBoundingClientRect()
  const children = [...li.querySelectorAll<HTMLElement>(':scope > ul > li')].map((child) =>
    read(child, depth + 1)
  )
  return { unit, width, height, depth, children, offsets: [], x: 0 }
}

/** Places an entry's children, and returns the entry's outline. */
const arrange = (entry: Entry, gap: number): Outline => {
  const own = { left: [-entry.width / 2], right: [entry.width / 2] }
  if (entry.children.length === 0) return own

  const outlines = entry.children.map((child) => arrange(child, gap))
  const positions = [0]
  const row: Outline = { left: [...outlines[0].left], right: [...outlines[0].right] }
  for (const outline of outlines.slice(1)) {
    // As close as the levels both reach allow
    let position = -Infinity
    const shared = Math.min(row.right.length, outline.left.length)
    for (let level = 0; level < shared; level++)
      position = Math.max(position, row.right[level] + gap - outline.left[level])
    positions.push(position)
    outline.left.forEach((left, level) => {
      if (level < row.left.length) {
        row.left[level] = Math.min(row.left[level], left + position)
        row.right[level] = Math.max(row.right[level], outline.right[level] + position)
      } else {
        row.left[level] = left + position
        row.right[level] = outline.right[level] + position
      }
    })
  }

  const middle = (positions[0] + positions[positions.length - 1]) / 2
  entry.offsets = positions.map((position) => position - middle)
  return {
    left: [...own.left, ...row.left.map((left) => left - middle)],
    right: [...own.right, ...row.right.map((right) => right - middle)],
  }
}

const place = (entry: Entry, x: number, all: Entry[]) => {
  entry.x = x
  all.push(entry)
  entry.children.forEach((child, index) => place(child, x + entry.offsets[index], all))
}

type Rect = { left: number; top: number; right: number; bottom: number }

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

const layOut = (tree: HTMLElement) => {
  const canvas = tree.querySelector<HTMLElement>('.fds-tree-canvas')!
  const top = canvas.querySelector<HTMLElement>(':scope > ul > li')!
  // The space between siblings, and between rows
  const gap = TREE_HORIZONTAL_SPACING * rem()
  const rowGap = TREE_VERTICAL_SPACING * rem()

  const root = read(top, 0)
  arrange(root, gap)
  const all: Entry[] = []
  place(root, 0, all)

  const depths = Math.max(...all.map((entry) => entry.depth)) + 1
  const rowHeights = Array.from({ length: depths }, (_, depth) =>
    Math.max(...all.filter((entry) => entry.depth === depth).map((entry) => entry.height))
  )
  const rowTops = rowHeights.map((_, depth) =>
    rowHeights.slice(0, depth).reduce((sum, height) => sum + height + rowGap, 0)
  )
  const minLeft = Math.min(...all.map((entry) => entry.x - entry.width / 2))
  const width = Math.max(...all.map((entry) => entry.x + entry.width / 2)) - minLeft
  const height = rowTops[depths - 1] + rowHeights[depths - 1]

  // Everything from the tree's left edge
  const rects: Rect[] = all.map((entry) => {
    const left = entry.x - entry.width / 2 - minLeft
    const rowTop = rowTops[entry.depth]
    return { left, top: rowTop, right: left + entry.width, bottom: rowTop + entry.height }
  })

  const lines: Rect[] = []
  const svg = document.createElementNS(SVG, 'svg')
  svg.classList.add('fds-tree-lines')
  svg.setAttribute('aria-hidden', 'true')
  let path = ''
  all.forEach((entry, index) => {
    if (entry.children.length === 0) return
    const x = entry.x - minLeft
    const bar = rowTops[entry.depth + 1] - rowGap / 2
    const xs = entry.children.map((child) => child.x - minLeft)
    path += `M${x} ${rects[index].bottom}V${bar}M${Math.min(x, ...xs)} ${bar}H${Math.max(x, ...xs)}`
    xs.forEach((childX) => (path += `M${childX} ${bar}V${rowTops[entry.depth + 1]}`))
    lines.push({
      left: Math.min(x, ...xs),
      top: rects[index].bottom,
      right: Math.max(x, ...xs),
      bottom: rowTops[entry.depth + 1],
    })
  })
  const line = document.createElementNS(SVG, 'path')
  line.setAttribute('d', path)
  svg.appendChild(line)

  // The canvas spans the figure, so the tree can be centred in it, and grows
  // past it, to scroll, where the tree needs more room
  const available = tree.clientWidth
  let treeLeft = Math.max(0, (available - width) / 2)
  let canvasHeight = height

  // The data box: into the first corner of the tree nothing occupies, or else
  // at the figure's bottom-left, with the tree kept clear of it
  const data = canvas.querySelector<HTMLElement>('.fds-tree-data')
  if (data && !data.classList.contains('fds-tree-data--placed')) {
    const box = data.getBoundingClientRect()
    const clearance = DATA_CLEARANCE * rem()
    const insetX = DATA_HORIZONTAL_INSET * rem()
    const insetY = DATA_VERTICAL_INSET * rem()
    const corners = [
      { left: insetX, top: height - insetY - box.height },
      { left: width - insetX - box.width, top: height - insetY - box.height },
      { left: insetX, top: insetY },
      { left: width - insetX - box.width, top: insetY },
    ]
    const free = corners.find(({ left, top }) => {
      const area = {
        left: left - clearance,
        top: top - clearance,
        right: left + box.width + clearance,
        bottom: top + box.height + clearance,
      }
      return left >= 0 && top >= 0 && ![...rects, ...lines].some((rect) => overlaps(area, rect))
    })
    if (free) {
      data.style.left = `${treeLeft + free.left}px`
      data.style.top = `${free.top}px`
    } else {
      // Inset from the corner, and the tree moved right only as far as the
      // parts level with the box need, so it stays as centred as it can
      const besideGap = DATA_TREE_SPACING * rem()
      canvasHeight = Math.max(height, box.height + insetY)
      const top = canvasHeight - insetY - box.height
      const level = [...rects, ...lines].filter(
        (rect) => rect.bottom > top - clearance && rect.top < top + box.height + clearance
      )
      const needed = Math.max(
        0,
        ...level.map((rect) => insetX + box.width + besideGap - (treeLeft + rect.left))
      )
      treeLeft += needed
      data.style.left = `${insetX}px`
      data.style.top = `${top}px`
    }
  }

  all.forEach((entry, index) => {
    entry.unit.style.left = `${rects[index].left + treeLeft}px`
    entry.unit.style.top = `${rects[index].top}px`
  })
  svg.style.left = `${treeLeft}px`
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  canvas.querySelector('.fds-tree-lines')?.remove()
  canvas.appendChild(svg)
  canvas.style.width = `${Math.max(available, treeLeft + width)}px`
  canvas.style.height = `${canvasHeight}px`
  tree.classList.add('fds-tree--laid-out')
}

/**
 * Lays out every tree on the page once it has a size, which for one that
 * starts hidden is when it's shown, and again whenever its width changes,
 * since the tree is centred in the figure.
 */
export const layOutTrees = () => {
  const widths = new WeakMap<Element, number>()
  const observer = new ResizeObserver((records) => {
    for (const { target } of records) {
      const tree = target as HTMLElement
      const width = tree.clientWidth
      if (width === 0 || widths.get(tree) === width) continue
      widths.set(tree, width)
      document.fonts.ready.then(() => layOut(tree))
    }
  })
  document.querySelectorAll<HTMLElement>('.fds-tree').forEach((tree) => observer.observe(tree))
}
