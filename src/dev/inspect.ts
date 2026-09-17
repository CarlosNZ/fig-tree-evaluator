/**
 * Dev-only inspector for the parser's intermediate forms. The library
 * itself logs nothing — this is the printer that makes a `ParseArtifact`
 * readable, for understanding what parse and validate produce.
 *
 * It reaches into internals (`parseExpression`, `runStaticChecks`,
 * `buildRegistry`) exactly as the white-box parse suites do: there is no
 * public compile method, by ruling ("Rulings on the surface" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Nothing here is barrel
 * surface, and the artifact types may be reshaped freely by later phases —
 * expect to adjust this file when they are.
 *
 * `inspect(expression, options)` prints six sections:
 *   input            — the expression as authored
 *   compiled tree    — the artifact's node tree, canonical form
 *   artifact         — counts, holes, shielding, dependencies
 *   parse issues     — what the walk (pass 1) emitted
 *   static issues    — what the metadata layer (pass 2) added
 *   validate()       — the public view, option-dependent checks included
 */
import { FigTree } from '../FigTree'
import type { FigTreeOptions } from '../options'
import type { Issue } from '../issues'
import type { PathSegment } from '../primitives'
import { buildRegistry } from '../registry'
import {
  parseExpression,
  renderSegments,
  runStaticChecks,
  type ArtifactHole,
  type CompiledNode,
  type NodePath,
  type ParseArtifact,
} from '../parse'
import { demoOperators } from './demoOperators'

const WIDTH = 78
/** Column the `#order  path` annotations start at. */
const ANNOTATION_COLUMN = 52

export interface InspectOptions extends FigTreeOptions {
  /** Section heading; defaults to a preview of the expression. */
  label?: string
}

const preview = (value: unknown, max = 48): string => {
  if (value === undefined) return 'undefined'
  if (typeof value === 'function') return '[function]'
  if (typeof value === 'symbol') return String(value)
  let text: string
  try {
    text = JSON.stringify(value) ?? String(value)
  } catch {
    text = String(value)
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Render a node path in the authored spelling: `each.values[0]`. */
const renderPath = (path: NodePath): string => {
  if (path.length === 0) return '(root)'
  return path
    .map((segment, i) =>
      typeof segment === 'number' ? `[${segment}]` : i === 0 ? String(segment) : `.${segment}`
    )
    .join('')
}

/** The canonical spelling of a reference node: `$data.user.name`. */
const renderReference = (namespace: string, segments: PathSegment[]): string => {
  const drill = renderSegments(segments)
  const joiner = drill === '' || drill.startsWith('[') ? '' : '.'
  return `$${namespace}${joiner}${drill}`
}

/** One line's worth of description — the node's kind and its own detail. */
const describeNode = (node: CompiledNode): string => {
  switch (node.kind) {
    case 'constant':
      return `constant  ${preview(node.value)}`
    case 'reference': {
      const canonical = renderReference(node.namespace, node.segments)
      const authored = canonical === node.raw ? '' : `  authored '${node.raw}'`
      const binding = node.binding === undefined ? '' : `  via as '${node.binding}'`
      return `reference ${canonical}${binding}${authored}`
    }
    case 'operator': {
      const marks: string[] = []
      if (node.useCache !== undefined) marks.push(`useCache ${node.useCache}`)
      if (node.precomputed !== undefined) marks.push('precomputed')
      if (node.entry.instanceDefaults !== undefined)
        marks.push(`instanceDefaults ${Object.keys(node.entry.instanceDefaults).join('+')}`)
      return `operator  ${node.name}${marks.length === 0 ? '' : `  {${marks.join('; ')}}`}`
    }
    case 'fragmentCall':
      return `fragment  ${node.name}  (${node.argumentsMode} arguments)`
    case 'template': {
      const holes = `${node.holes.length} hole${node.holes.length === 1 ? '' : 's'}`
      return `template  ${holes}  skeleton: ${preview(node.skeleton)}`
    }
    case 'invalid':
      return `invalid   ${preview(node.raw)}`
  }
}

interface Child {
  label: string
  node: CompiledNode
}

/** Every compiled child, labelled the way the artifact reaches it. */
const childrenOf = (node: CompiledNode): Child[] => {
  const children: Child[] = []
  if (node.kind === 'operator')
    for (const [name, param] of Object.entries(node.params))
      children.push({ label: name, node: param })
  if (node.kind === 'fragmentCall' && node.parameters !== undefined) {
    if (node.argumentsMode === 'dynamic')
      children.push({ label: 'parameters', node: node.parameters as CompiledNode })
    else
      for (const [name, argument] of Object.entries(
        node.parameters as Record<string, CompiledNode>
      ))
        children.push({ label: name, node: argument })
  }
  if (node.kind === 'template')
    for (const hole of node.holes)
      children.push({ label: `at ${renderPath(hole.at)}`, node: hole.node })
  if (node.kind === 'operator' || node.kind === 'fragmentCall' || node.kind === 'template')
    if (node.vars !== undefined)
      for (const [name, definition] of Object.entries(node.vars))
        children.push({ label: `vars.${name}`, node: definition })
  if (node.kind === 'operator' || node.kind === 'fragmentCall')
    if (node.fallback !== undefined) children.push({ label: 'fallback', node: node.fallback })
  return children
}

const printNode = (node: CompiledNode, label: string | null, depth: number) => {
  const head = label === null ? '' : `${label}: `
  const text = `${'  '.repeat(depth)}${head}${describeNode(node)}`
  const gap = Math.max(ANNOTATION_COLUMN - text.length, 2)
  console.log(`${text}${' '.repeat(gap)}#${node.order}  ${renderPath(node.path)}`)
  for (const child of childrenOf(node)) printNode(child.node, child.label, depth + 1)
}

const holeFallback = (hole: ArtifactHole): string =>
  hole.staticFallback === undefined
    ? '  staticFallback: —'
    : `  staticFallback: ${preview(hole.staticFallback.value)}`

const printArtifactFacts = (artifact: ParseArtifact) => {
  const { dependencies: deps } = artifact
  const list = (values: string[]) => (values.length === 0 ? '—' : values.join(', '))
  console.log('\nartifact:')
  console.log(
    `  nodeCount ${artifact.nodeCount}   maxDepth ${artifact.maxDepth}` +
      `   shielded ${artifact.shielded}   identityOnly ${artifact.identityOnly}`
  )
  console.log(`  operators    ${list(deps.operators)}`)
  console.log(`  dataPaths    ${list(deps.dataPaths)}   (dynamic read-set: ${deps.dynamic})`)
  console.log(`  fragments    ${list(deps.fragments)}`)
  if (artifact.holes.length === 0) {
    console.log('  holes        none — the input is fully constant')
    return
  }
  console.log(`  holes        ${artifact.holes.length}`)
  for (const hole of artifact.holes)
    console.log(
      `    ${renderPath(hole.path).padEnd(20)} ${describeNode(hole.node)}${holeFallback(hole)}`
    )
}

const printIssues = (heading: string, issues: Issue[]) => {
  if (issues.length === 0) {
    console.log(`\n${heading}: none`)
    return
  }
  console.log(`\n${heading}:`)
  for (const issue of issues) {
    const tags: string[] = []
    if (issue.operator !== undefined) tags.push(`operator '${issue.operator}'`)
    if (issue.parameter !== undefined) tags.push(`parameter '${issue.parameter}'`)
    console.log(
      `  ${issue.severity.padEnd(7)} ${issue.code.padEnd(22)} at ${renderPath(issue.path)}`
    )
    console.log(`          ${issue.message}${tags.length === 0 ? '' : `  [${tags.join(', ')}]`}`)
  }
}

/**
 * Parse and validate one expression, printing every intermediate form.
 * `options` are ordinary `FigTreeOptions` — supply `operators` to use your
 * own registry instead of the demo set, `data` to exercise the sample-data
 * warning, `maxNodes`/`maxDepth` for the limit checks.
 */
export const inspect = (expression: unknown, options: InspectOptions = {}): void => {
  const { label, ...figOptions } = options
  const operators = figOptions.operators ?? [demoOperators()]
  const registry = buildRegistry({
    operators,
    ...(figOptions.operatorDefaults !== undefined
      ? { operatorDefaults: figOptions.operatorDefaults }
      : {}),
  })

  console.log(`\n${'━'.repeat(WIDTH)}`)
  console.log(label ?? preview(expression, WIDTH - 2))
  console.log('━'.repeat(WIDTH))
  console.log('\ninput:')
  console.log(JSON.stringify(expression, null, 2) ?? String(expression))

  // Pass 1 — the walk. Its issues are snapshotted before pass 2 runs, so
  // the two layers can be told apart; they share one stream in the artifact.
  const artifact = parseExpression(expression, registry)
  const parseIssues = artifact.issues.map((sequenced) => sequenced.issue)
  // Pass 2 — the metadata layer appends to that same stream, in place
  runStaticChecks(artifact)
  const staticIssues = artifact.issues
    .map((sequenced) => sequenced.issue)
    .filter((issue) => !parseIssues.includes(issue))

  console.log('\ncompiled tree:')
  printNode(artifact.root, null, 0)
  printArtifactFacts(artifact)
  printIssues('parse issues (pass 1 — grammar)', parseIssues)
  printIssues('static issues (pass 2 — metadata)', staticIssues)

  // The public view: parses again behind validate(), then adds the
  // option-dependent checks (maxDepth/maxNodes, sample data) the artifact
  // deliberately never stores
  const result = new FigTree({ ...figOptions, operators }).validate(expression)
  console.log(`\nvalidate(): valid ${result.valid}   timeoutShielded ${result.timeoutShielded}`)
  printIssues('validate() issues', result.issues)
}
