import type { InspectNode, InspectReport } from 'fig-tree-evaluator'
import JSON5 from 'json5'

/** What `inspect()` prints a skeleton's reserved slots as. */
const HOLE = '<hole>'
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/**
 * A value on one line, however long, in the site's JSON5 style, with a
 * skeleton's holes unquoted so they don't read as authored strings.
 */
const oneLine = (value: unknown): string => {
  if (value === HOLE) return HOLE
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(
      ([key, item]) => `${IDENTIFIER.test(key) ? key : JSON5.stringify(key)}: ${oneLine(item)}`
    )
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
  }
  return JSON5.stringify(value) ?? 'undefined'
}

/** A path as it would be written in JavaScript, from the expression's root. */
const showPath = (path: (string | number)[]): string =>
  path
    .map((key, index) =>
      typeof key === 'number'
        ? `[${key}]`
        : IDENTIFIER.test(key)
          ? `${index === 0 ? '' : '.'}${key}`
          : `[${JSON5.stringify(key)}]`
    )
    .join('') || '(root)'

interface Line {
  text: string
  path: string
}

/**
 * The compiled tree in `report`, one line per compiled piece: its kind and
 * what compiling made of it, indented under the piece it belongs to and
 * labelled with where it sits there. Each line also carries its piece's path
 * in the expression as written.
 */
export const showCompiled = (report: InspectReport, { paths = false } = {}): string => {
  const lines: Line[] = []

  const add = (depth: number, label: string | undefined, text: string, node: InspectNode) =>
    lines.push({
      text: `${'  '.repeat(depth)}${label === undefined ? '' : `${label}: `}${text}`,
      path: showPath(node.path),
    })

  const children = (depth: number, map: Record<string, InspectNode> | undefined, prefix = '') => {
    for (const [name, child] of Object.entries(map ?? {})) walk(child, depth, prefix + name)
  }

  const walk = (node: InspectNode, depth: number, label?: string): void => {
    switch (node.kind) {
      case 'constant':
        add(depth, label, `constant ${oneLine(node.value)}`, node)
        return
      case 'reference':
        add(depth, label, `reference ${node.reference}`, node)
        return
      case 'operator':
        add(depth, label, `operator ${node.operator}`, node)
        children(depth + 1, node.vars, 'vars.')
        children(depth + 1, node.params)
        if (node.fallback) walk(node.fallback, depth + 1, 'fallback')
        return
      case 'fragmentCall':
        add(depth, label, `fragment ${node.fragment}`, node)
        children(depth + 1, node.vars, 'vars.')
        // Computed arguments are one node; static ones, a node per parameter
        if (node.argumentsMode === 'dynamic' && node.parameters !== undefined)
          walk(node.parameters as InspectNode, depth + 1, 'parameters')
        else children(depth + 1, node.parameters as Record<string, InspectNode> | undefined)
        if (node.fallback) walk(node.fallback, depth + 1, 'fallback')
        return
      case 'skeleton':
        add(depth, label, `skeleton ${oneLine(node.shape)}`, node)
        children(depth + 1, node.vars, 'vars.')
        for (const hole of node.holes) walk(hole.node, depth + 1, showPath(hole.at))
        return
      case 'elements':
        add(depth, label, 'elements', node)
        node.elements.forEach((element, index) => walk(element, depth + 1, `[${index}]`))
        return
      case 'entries':
        add(depth, label, 'entries', node)
        children(depth + 1, node.vars, 'vars.')
        children(depth + 1, node.entries)
        return
      case 'invalid':
        add(depth, label, `invalid ${oneLine(node.raw)}`, node)
        return
    }
  }

  walk(report.canonicalForm, 0)

  if (!paths) return lines.map(({ text }) => text).join('\n')
  const width = Math.max(...lines.map(({ text }) => text.length)) + 2
  return lines.map(({ text, path }) => `${text.padEnd(width)}// ${path}`).join('\n')
}
