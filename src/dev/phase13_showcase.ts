/**
 * Phase 13 showcase — `pnpm dev phase13_showcase`. Introspection: what an
 * instance can tell a tool about itself, and what an expression can tell a
 * tool about what it needs. Every phase closes with one of these
 * (implementation-plan working rule 7).
 *
 * Runs offline. The first half evaluates nothing: every call in it is a
 * synchronous read, and the thread through it is that the whole editing
 * surface — an operator dropdown with sections, a parameter form with
 * defaults, a cache-invalidation key, a "does this do anything?" badge —
 * is answerable from four methods and a property. The second half is the
 * two later chunks: `compile()`, a handle an expression is compiled into
 * once and evaluated through many times, and `inspect()`, the report of
 * what the compiler made of it.
 */
import { FigTree, coreOperators, defineOperator, httpOperators, inspect } from '../index'
import type { OperatorInfo } from '../index'
import { block, outcome, section } from './showcase'

const clamp = defineOperator({
  name: 'clamp',
  alias: '><',
  category: 'math',
  description: 'Constrain a number to a range',
  parameters: {
    value: { type: ['number', 'null'] },
    min: { type: 'number', default: 0 },
    max: { type: 'number', default: 1 },
  },
  positionalParams: ['value', 'min', 'max'],
  metadata: { team: 'config-admins' },
  returns: 'number',
  evaluate: ({ value, min, max }) => Math.min(max, Math.max(min, value)),
})

const fig = new FigTree({
  // The I/O pair is registered so the `io` category is populated and the
  // capability probe below has something to find; nothing here calls it
  operators: [coreOperators, httpOperators(), clamp],
  // Two per-operator presets, so the snapshot has something to report
  // BESIDE the authored values
  operatorDefaults: {
    round: { decimals: 2 },
    http: { fallback: null },
    clamp: { max: 100, useCache: true },
  },
  // A credential, so the inspector's options block has something to
  // withhold
  http: { headers: { Authorization: 'Bearer s3cret' } },
  fragments: {
    themeColour: {
      expression: { $get: 'settings.theme.colour' },
      description: 'The configured theme colour',
      metadata: { backgroundColor: '#B2E0FF' },
    },
    banner: {
      expression: {
        $buildString: ['%1 — %2', '$params.title', { $themeColour: {} }],
      },
      parameters: {
        title: { type: 'string', description: 'The headline' },
        upper: { type: 'boolean', default: false },
      },
      description: 'A titled banner in the configured colour',
    },
    // A body whose `$` key resolves to nothing: inert data plus a warning
    // that registration has no other channel for
    legacy: { expression: { $flibble: 'inert' } },
  },
})

/** Bodies of `shout` that actually ran, across both definitions. */
let runs = 0

/**
 * Two definitions of one operator, as a host ships a fix to it. Their
 * bodies differ, so their fingerprints do, and the result store keys the
 * two apart. Both are written out in full: a factory closing over the
 * difference would give both one body text, and one fingerprint.
 */
const shout = defineOperator({
  name: 'shout',
  category: 'string',
  description: 'Upper-case a string',
  parameters: { text: { type: 'string' } },
  positionalParams: ['text'],
  returns: 'string',
  useCache: true,
  evaluate: ({ text }) => {
    runs++
    return text.toUpperCase()
  },
})

const shoutEmphatic = defineOperator({
  name: 'shout',
  category: 'string',
  description: 'Upper-case a string, with emphasis',
  parameters: { text: { type: 'string' } },
  positionalParams: ['text'],
  returns: 'string',
  useCache: true,
  evaluate: ({ text }) => {
    runs++
    return `${text.toUpperCase()}!`
  },
})

/** A second instance, so the redefinition below leaves `fig` untouched. */
const live = new FigTree({ operators: [coreOperators, shout] })

/** One parameter, as a form-builder would read it. */
const parameterLine = (name: string, info: OperatorInfo): string => {
  const parameter = info.parameters[name]
  const bits = [String(block(parameter.type))]
  if (!parameter.required) bits.push('optional')
  if (Object.hasOwn(parameter, 'default')) bits.push(`default ${block(parameter.default)}`)
  if (Object.hasOwn(parameter, 'instanceDefault'))
    bits.push(`instance ${block(parameter.instanceDefault)}`)
  if (parameter.evaluation !== 'eager') bits.push(parameter.evaluation)
  return `      ${name.padEnd(16)}${bits.join(', ')}`
}

const main = async () => {
  const operators = fig.getOperators()

  section('getOperators(): an operator dropdown, grouped by category')

  // The method does not sort — grouping is the consumer's job, done from
  // the data the snapshot hands it. This IS that job, in four lines
  const grouped = new Map<string, string[]>()
  for (const info of operators) {
    const names = grouped.get(info.category) ?? []
    names.push(info.alias !== undefined ? `${info.name} (${info.alias})` : info.name)
    grouped.set(info.category, names)
  }
  for (const [category, names] of grouped)
    console.log(`  ${category.padEnd(12)}${names.join(', ')}`)
  console.log(`\n  ${operators.length} operators, every one categorised and described.\n`)

  section('…and a parameter form, from the same read')

  for (const name of ['clamp', 'round', 'regex']) {
    const info = operators.find((entry) => entry.name === name)
    if (info === undefined) continue
    const flags = [
      info.hasValidate ? 'has a validate hook' : null,
      info.cache === 'manual' ? 'caches manually' : null,
      info.restParam !== null ? `rest: ${info.restParam}` : null,
      info.timeoutParam !== null ? `deadline: ${info.timeoutParam}` : null,
      Object.hasOwn(info, 'instanceUseCache') ? `instance useCache ${info.instanceUseCache}` : null,
    ].filter((flag) => flag !== null)
    console.log(`  ${name} — ${info.description}`)
    for (const parameter of Object.keys(info.parameters))
      console.log(parameterLine(parameter, info))
    if (flags.length > 0) console.log(`      ${flags.join(' · ')}`)
    console.log('')
  }

  console.log(
    '  Authored value and instance override are reported side by side —\n' +
      "  `round.decimals` still declares 0, and this host's 2 sits beside it,\n" +
      '  so a tool can tell a definition from a deployment.\n'
  )

  section('getFragments(): declarations, never bodies')

  for (const info of fig.getFragments()) {
    const parameters = Object.entries(info.parameters)
      .map(([name, p]) => (p.required ? name : `${name}?`))
      .join(', ')
    console.log(`  ${info.name}(${parameters}) — ${info.description ?? 'no description'}`)
    console.log(`      reads    ${block(info.dependencies.data.paths) || '—'}`)
    console.log(
      `      calls    ${block([...info.dependencies.operators, ...info.dependencies.fragments])}`
    )
    if (info.warnings.length > 0)
      console.log(`      warning  ${info.warnings.map((issue) => issue.message).join('; ')}`)
    console.log('')
  }

  console.log(
    '  The body never travels, so the rollup is how "what does this read?"\n' +
      '  stays answerable — and a body warning has nowhere else to go, since\n' +
      '  registration reports errors by throwing.\n'
  )

  section('getDependencies(): what an expression needs, before it runs')

  const expressions: [string, unknown][] = [
    [
      'plain reads, deduplicated and traversal-sorted',
      {
        title: '$data.page.title',
        subtitle: { $get: 'page.subtitle' },
        totals: { $get: 'orders[*].total' },
        first: { $get: 'orders[0].total' },
        page: '$data.page',
      },
    ],
    [
      'a key holding a dot is not two levels',
      {
        a: { $get: { path: ['first.last'] } },
        b: '$data.first.last',
      },
    ],
    ['a computed path makes the read-set unenumerable', { $get: '$data.chosen' }],
    ['transitive through a fragment call', { $banner: { title: 'Q3' } }],
    [
      'internal namespaces name nothing outside',
      {
        vars: { n: 3 },
        value: { $map: ['$data.items', { $plus: ['$element', '$vars.n'] }] },
      },
    ],
  ]

  for (const [label, expression] of expressions) {
    const { data, operators: used, fragments: called } = fig.getDependencies(expression)
    console.log(`  ${label}\n      ${block(expression)}`)
    console.log(`    → paths ${block(data.paths)}${data.dynamic ? '  (+ dynamic reads)' : ''}`)
    console.log(`      calls ${block([...used, ...called])}\n`)
  }

  console.log(
    '  I/O use is the intersection with http / graphQL / sql — no separate\n' +
      '  probe is needed:\n' +
      `      ${block(fig.getDependencies({ $http: 'https://x.test' }).operators)}\n`
  )

  section('isEvaluable(): would evaluating this change anything?')

  const candidates: [string, unknown][] = [
    ['an operator node', { $plus: [1, 2] }],
    ['an expression buried in a constant shell', { a: { b: { $clamp: [5, 0, 3] } } }],
    ['a fragment call', { $themeColour: {} }],
    ['a plain config object', { title: 'Report', tags: ['a', 'b'] }],
    ['a stray $ key — inert data, with a warning', { $flibble: 'inert' }],
    ['a malformed node — broken, but an expression', { operator: 'plus', fragment: 'banner' }],
  ]
  for (const [label, expression] of candidates)
    console.log(
      `  ${String(fig.isEvaluable(expression)).padEnd(6)}${label}\n      ${block(expression)}\n`
    )

  section('version')
  console.log(`  fig.version — ${fig.version}\n`)

  section('compile(): compile once, hold the handle, evaluate many times')

  const template = {
    greeting: { $shout: '$data.name' },
    total: { $plus: ['$data.subtotal', '$data.shipping'] },
  }
  const ada = { name: 'ada', subtotal: 40, shipping: 5 }
  const grace = { name: 'grace', subtotal: 12, shipping: 0 }

  const card = live.compile(template)
  console.log(`  const card = live.compile(template)\n      ${block(template)}`)
  console.log(
    `    → hasErrors ${card.hasErrors}, ${card.issues.length} issues, ` +
      `reads ${block(card.getDependencies().data.paths)}\n`
  )

  const run = async (label: string, evaluation: () => Promise<unknown>) =>
    console.log(`  ${label.padEnd(40)}${await outcome(evaluation)}   bodies run: ${runs}`)

  await run('card.evaluate({ data: ada })', () => card.evaluate({ data: ada }))
  await run('card.evaluate({ data: grace })', () => card.evaluate({ data: grace }))
  await run('live.evaluate(template, { data: ada })', () => live.evaluate(template, { data: ada }))

  console.log(
    '\n  One result store: the instance is served the answer the handle\n' +
      '  cached, and the body does not run again.\n'
  )

  live.updateOptions({ operators: [coreOperators, shoutEmphatic] })
  console.log('  live.updateOptions({ operators: [coreOperators, shoutEmphatic] })\n')

  await run('live.evaluate(template, { data: ada })', () => live.evaluate(template, { data: ada }))
  await run('card.evaluate({ data: ada })', () => card.evaluate({ data: ada }))

  console.log(
    '\n  The redefinition keys apart from its predecessor by fingerprint, so\n' +
      '  the instance is not served the old answer. The handle is a snapshot\n' +
      '  of the instance as it was at compile(), and keeps answering from its\n' +
      "  own definition's entries.\n"
  )

  const config = { title: 'Report', tags: ['a', 'b'] }
  const plain = live.compile(config)
  console.log(`  inert input\n      ${block(config)}`)
  console.log(
    `    → hasErrors ${plain.hasErrors}, and evaluate() hands back the ` +
      `input itself: ${(await plain.evaluate()) === config}\n`
  )

  const broken = { a: { $round: ['ten'] }, b: { operator: 'flibble' } }
  const refused = live.compile(broken)
  console.log(`  a static error\n      ${block(broken)}`)
  console.log(`    → hasErrors ${refused.hasErrors}, and issues says why before anything runs:`)
  for (const issue of refused.issues)
    console.log(`        ${issue.code} at ${JSON.stringify(issue.path)}: ${issue.message}`)
  console.log(`      evaluate() ${await outcome(() => refused.evaluate())}\n`)

  section('inspect(): how the engine sees an expression')

  const order = {
    heading: { $banner: { title: '$data.title' } },
    total: { $round: '$data.total' },
    badge: { $colour: 'red' },
  }
  const report = inspect(fig.compile(order), { data: { title: 'Q3' } })
  console.log(`  const report = inspect(fig.compile(order), { data })\n      ${block(order)}\n`)

  console.log(`  canonicalForm — the compiled tree, in the artifact's own shapes`)
  console.log(`      ${block(report.canonicalForm)}\n`)

  // `badge` is inert data folded into the root's shape, so its warning's
  // order names a value the tree has no node for
  console.log("  issues — validate()'s list, a compile-stream entry carrying its order")
  for (const issue of report.issues)
    console.log(
      `      ${issue.order === undefined ? '  ' : `#${issue.order}`} ` +
        `${issue.severity} ${issue.code}: ${issue.message}`
    )

  console.log('\n  dependencies — composed through the fragment call, beside its own')
  console.log(`      composed  ${block(report.dependencies)}`)
  console.log(`      own       ${block(report.own.dependencies)}`)

  console.log('\n  options — only those set, the credential withheld, data summarized')
  console.log(`      ${block(report.options)}`)
  console.log(
    `\n  nodeCount ${report.nodeCount} (own ${report.own.nodeCount}), ` +
      `maxDepth ${report.maxDepth}, timeoutShielded ${report.timeoutShielded}\n`
  )

  console.log(
    '  One plain object, JSON through and through, so a tool can log it,\n' +
      '  diff two of them, or send it to a browser panel. Its shape follows\n' +
      "  the compiler's and is outside semver; `version` says which release\n" +
      `  made it (${report.version}).\n`
  )
}

main()
