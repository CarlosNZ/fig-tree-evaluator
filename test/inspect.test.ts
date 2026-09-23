/**
 * The standalone `inspect()` — the compiled-expression inspector (#156; the
 * design record is docs-dev/v3-specs/v3-inspect.md).
 *
 * The report's shape follows the compiler and is outside semver, so these
 * tests pin it as it stands and move with the compiler by design — the one
 * sanctioned reader of the artifact's shapes. What they enforce beyond the
 * shape are the report's promises: it is JSON through and through, its
 * `issues` are `validate()`'s, it shares nothing with the artifact the
 * compile cache hands to every holder, and it never touches the caller's
 * expression.
 */
import { coreOperators, ErrorCodes, FigTree, FigTreeError, inspect, version } from '../src'
import type { FigTreeOptions, InspectNode, InspectReport } from '../src'

const greet = {
  expression: { $join: ['Hello, ', '$params.name'], fallback: 'Hello!' },
  parameters: { name: { type: 'string' } },
} as const

const build = (options: FigTreeOptions = {}) =>
  new FigTree({ operators: [coreOperators], fragments: { greet }, ...options })

const report = (expression: unknown, options: FigTreeOptions = {}): InspectReport =>
  inspect(build(options).compile(expression))

/** Every node in the tree, keyed by `order`. */
const nodesOf = (root: InspectNode): Map<number, InspectNode> => {
  const nodes = new Map<number, InspectNode>()
  const visit = (node: InspectNode) => {
    nodes.set(node.order, node)
    const children: InspectNode[] = 'vars' in node && node.vars ? Object.values(node.vars) : []
    switch (node.kind) {
      case 'operator':
        children.push(...Object.values(node.params), ...(node.fallback ? [node.fallback] : []))
        break
      case 'fragmentCall':
        if (node.parameters !== undefined)
          children.push(
            ...(node.argumentsMode === 'dynamic'
              ? [node.parameters as InspectNode]
              : Object.values(node.parameters as Record<string, InspectNode>))
          )
        if (node.fallback) children.push(node.fallback)
        break
      case 'skeleton':
        children.push(...node.holes.map((hole) => hole.node))
        break
      case 'elements':
        children.push(...node.elements)
        break
      case 'entries':
        children.push(...Object.values(node.entries))
        break
    }
    children.forEach(visit)
  }
  visit(root)
  return nodes
}

const byKind = (root: InspectNode, kind: InspectNode['kind']) =>
  [...nodesOf(root).values()].filter((node) => node.kind === kind)

// ── The report ──────────────────────────────────────────────────────

describe('the report', () => {
  const expression = {
    '//': 'Order summary',
    vars: { sum: { $plus: ['$data.subtotal', '$data.shipping'] } },
    createdAt: new Date('2026-09-23T00:00:00Z'),
    greeting: { $greet: { name: '$d.customer.name' } },
    contact: { $firstOf: ['$data.customer.email', 'no contact'] },
    total: { operator: '+', values: ['$vars.sum', 0], fallback: 0 },
    note: undefined,
  }

  test('ten fields, in their order', () => {
    expect(Object.keys(report(expression))).toEqual([
      'version',
      'expression',
      'options',
      'canonicalForm',
      'issues',
      'timeoutShielded',
      'nodeCount',
      'maxDepth',
      'dependencies',
      'own',
    ])
  })

  test('version is the library release', () => {
    expect(report(expression).version).toBe(version)
  })

  test('JSON through and through: a round trip changes nothing', () => {
    const result = report(expression, { data: { subtotal: 1 }, maxNodes: 3 })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  test('expression is the source as provided, converted', () => {
    const { expression: source } = report(expression)
    expect(source).toMatchObject({
      '//': 'Order summary',
      createdAt: '[Date 2026-09-23T00:00:00.000Z]',
      greeting: { $greet: { name: '$d.customer.name' } },
      note: '[undefined]',
    })
  })
})

// ── canonicalForm ───────────────────────────────────────────────────

describe('canonicalForm', () => {
  const expression = {
    vars: { sum: { $plus: ['$data.a', 1] } },
    greeting: { $greet: { name: '$d.name' } },
    lines: { $map: { input: '$data.items', as: 'item', each: '$item.id' } },
    status: { $match: ['$data.s', { ok: 'yes', no: '$vars.sum' }] },
    first: { $firstOf: ['$data.x', 'none'] },
    broken: { operator: 'flibble' },
  }
  const { canonicalForm: root, issues } = report(expression)
  const nodes = nodesOf(root)
  const at = (...path: (string | number)[]) =>
    [...nodes.values()].find((node) => JSON.stringify(node.path) === JSON.stringify(path))

  test('a plain-object root is a skeleton, its vars first and its holes marked', () => {
    expect(root).toMatchObject({ order: 0, kind: 'skeleton', path: [] })
    expect(Object.keys(root)).toEqual(['order', 'kind', 'path', 'vars', 'shape', 'holes'])
    if (root.kind !== 'skeleton') throw new Error('unreachable')
    expect(root.shape).toEqual({
      greeting: '<hole>',
      lines: '<hole>',
      status: '<hole>',
      first: '<hole>',
      broken: '<hole>',
    })
    expect(root.holes.map((hole) => hole.at)).toEqual([
      ['greeting'],
      ['lines'],
      ['status'],
      ['first'],
      ['broken'],
    ])
    expect(root.vars?.sum).toMatchObject({ kind: 'operator', operator: 'plus' })
  })

  test('a reference: the canonical spelling beside the authored one', () => {
    expect(at('greeting', '$greet', 'name')).toEqual({
      order: expect.any(Number),
      kind: 'reference',
      path: ['greeting', '$greet', 'name'],
      reference: '$data.name',
      authored: '$d.name',
    })
  })

  test('a reference through an `as` binding names it', () => {
    expect(at('lines', '$map', 'each')).toMatchObject({
      kind: 'reference',
      reference: '$item.id',
      binding: 'item',
    })
  })

  test('an operator: the canonical name, named parameters, a constant parameter as a node', () => {
    const map = at('lines')
    expect(map).toMatchObject({ kind: 'operator', operator: 'map' })
    if (map?.kind !== 'operator') throw new Error('unreachable')
    expect(Object.keys(map.params).sort()).toEqual(['as', 'each', 'input'])
    expect(map.params.as).toMatchObject({ kind: 'constant', value: 'item' })
  })

  test('a fragment call: the name, resolution and argument mode, the body not expanded', () => {
    const call = at('greeting')
    expect(call).toMatchObject({
      kind: 'fragmentCall',
      fragment: 'greet',
      resolved: true,
      argumentsMode: 'static',
    })
    if (call?.kind !== 'fragmentCall') throw new Error('unreachable')
    expect(call.parameters).toEqual({ name: expect.objectContaining({ kind: 'reference' }) })
  })

  test('a dynamic-arguments fragment call carries its parameters as one node', () => {
    // Canonical face only: the shorthand `{ $greet: '$data.args' }` is an
    // error by ruling, the banned single-value form
    const call = report({ fragment: 'greet', parameters: '$data.args' }).canonicalForm
    expect(call).toMatchObject({
      kind: 'fragmentCall',
      argumentsMode: 'dynamic',
      parameters: { kind: 'reference', reference: '$data.args' },
    })
  })

  test('an unresolved fragment call says so', () => {
    expect(report({ fragment: 'nope' }).canonicalForm).toMatchObject({
      kind: 'fragmentCall',
      fragment: 'nope',
      resolved: false,
    })
  })

  test('entries and elements keep one node per entry and element, constants included', () => {
    expect(at('status', '$match', 1)).toMatchObject({
      kind: 'entries',
      entries: {
        ok: { kind: 'constant', value: 'yes' },
        no: { kind: 'reference', reference: '$vars.sum' },
      },
    })
    expect(at('first', '$firstOf')).toMatchObject({
      kind: 'elements',
      elements: [
        { kind: 'reference', reference: '$data.x' },
        { kind: 'constant', value: 'none' },
      ],
    })
  })

  test('an invalid node keeps its raw input, and shares its order with its issue', () => {
    const broken = at('broken')
    expect(broken).toMatchObject({ kind: 'invalid', raw: { operator: 'flibble' } })
    const issue = issues.find((entry) => entry.code === ErrorCodes.unknownOperator)
    expect(issue?.order).toBe(broken?.order)
  })

  test('a constant folded into a shape leaves a gap in the order', () => {
    const { canonicalForm } = report({ $join: ['a', '$data.b'] })
    if (canonicalForm.kind !== 'operator') throw new Error('unreachable')
    const values = canonicalForm.params.values
    expect(values).toMatchObject({ kind: 'skeleton', shape: ['a', '<hole>'] })
    if (values.kind !== 'skeleton') throw new Error('unreachable')
    // `'a'` took the number between the skeleton and its hole
    expect(values.holes[0].node.order).toBe(values.order + 2)
  })

  test('holes[].at identifies the holes: an authored "<hole>" string is not one', () => {
    const { canonicalForm } = report({ a: '<hole>', b: '$data.x' })
    expect(canonicalForm).toMatchObject({ shape: { a: '<hole>', b: '<hole>' } })
    if (canonicalForm.kind !== 'skeleton') throw new Error('unreachable')
    expect(canonicalForm.holes.map((hole) => hole.at)).toEqual([['b']])
  })

  test('a reserved array slot is a hole, not an unassigned slot', () => {
    const { canonicalForm } = report({ list: [1, '$data.x'] })
    expect(canonicalForm).toMatchObject({ shape: { list: [1, '<hole>'] } })
  })

  test('operatorDefaults show as the keys they apply; useCache as authored', () => {
    const { canonicalForm } = report(
      { $join: ['a', '$data.b'], useCache: false },
      { operatorDefaults: { join: { delimiter: '-' } } }
    )
    expect(canonicalForm).toMatchObject({ useCache: false, instanceDefaults: ['delimiter'] })
  })
})

// ── timeoutFallback and timeoutShielded ─────────────────────────────

describe('timeoutFallback', () => {
  test('from each of its three sources, on the top-level holes only', () => {
    const { canonicalForm, timeoutShielded } = report(
      {
        authored: { $plus: [1, '$data.x'], fallback: 0 },
        defaulted: { $firstOf: ['$data.y'] },
        lifted: { $greet: { name: '$data.n' } },
        nested: { $plus: [{ $divide: [1, '$data.z'], fallback: 0 }, 1] },
        dynamic: { $plus: [1, '$data.w'], fallback: '$data.v' },
      },
      { operatorDefaults: { firstOf: { fallback: 'unknown' } } }
    )
    if (canonicalForm.kind !== 'skeleton') throw new Error('unreachable')
    const hole = (key: string) => canonicalForm.holes.find((entry) => entry.at[0] === key)?.node
    expect(hole('authored')).toMatchObject({ timeoutFallback: 0 })
    expect(hole('defaulted')).toMatchObject({
      timeoutFallback: 'unknown',
      instanceDefaults: ['fallback'],
    })
    expect(hole('defaulted')).not.toHaveProperty('fallback')
    expect(hole('lifted')).toMatchObject({ timeoutFallback: 'Hello!' })
    expect(hole('lifted')).not.toHaveProperty('fallback')
    // A constant fallback below the top level catches failures, not timeouts
    expect(hole('nested')).not.toHaveProperty('timeoutFallback')
    const divide = byKind(canonicalForm, 'operator').find(
      (node) => node.kind === 'operator' && node.operator === 'divide'
    )
    expect(divide).toMatchObject({ fallback: { kind: 'constant', value: 0 } })
    expect(divide).not.toHaveProperty('timeoutFallback')
    // A dynamic fallback could start work past the deadline
    expect(hole('dynamic')).not.toHaveProperty('timeoutFallback')
    expect(timeoutShielded).toBe(false)
  })

  test('a node root is its own hole', () => {
    const result = report({ $plus: [1, '$data.x'], fallback: 0 })
    expect(result.canonicalForm).toMatchObject({ kind: 'operator', timeoutFallback: 0 })
    expect(result.timeoutShielded).toBe(true)
  })

  test('the value is converted like any authored value', () => {
    const { canonicalForm } = report({
      $plus: [1, '$data.x'],
      fallback: { $literal: new Date('2026-01-01T00:00:00Z') },
    })
    expect(canonicalForm).toMatchObject({ timeoutFallback: '[Date 2026-01-01T00:00:00.000Z]' })
  })

  test('a constant null fallback is present as null', () => {
    const { canonicalForm } = report({ $plus: [1, '$data.x'], fallback: null })
    expect(canonicalForm).toHaveProperty('timeoutFallback', null)
  })

  test('timeoutShielded needs every top-level hole, and holds vacuously for a constant', () => {
    expect(
      report({ a: { $plus: [1, '$data.x'], fallback: 0 }, b: { $greet: {} } }).timeoutShielded
    ).toBe(true)
    expect(
      report({ a: { $plus: [1, '$data.x'], fallback: 0 }, b: '$data.y' }).timeoutShielded
    ).toBe(false)
    expect(report({ a: 1 }).timeoutShielded).toBe(true)
  })
})

// ── Converting authored values ──────────────────────────────────────

describe('authored values', () => {
  class Widget {}
  class Thrower {
    toJSON() {
      throw new Error('no')
    }
  }
  class Self {
    toJSON() {
      return this
    }
  }
  class Money {
    toJSON() {
      return 'NZD 5.00'
    }
  }
  const named = function greet() {}
  const cyclic: Record<string, unknown> = { a: 1 }
  cyclic.self = cyclic

  /** A `literal` payload reaches the report unwalked, as one constant. */
  const constantOf = (value: unknown) => {
    const { canonicalForm } = report({ $literal: value })
    if (canonicalForm.kind !== 'constant') throw new Error('unreachable')
    return canonicalForm
  }

  test.each([
    [
      'a Date, carrying its toJSON string',
      new Date('2026-09-23T00:00:00Z'),
      '[Date 2026-09-23T00:00:00.000Z]',
    ],
    ["any class's toJSON string", new Money(), '[Money NZD 5.00]'],
    ['a Map', new Map([[1, 2]]), '[Map]'],
    ['a class instance', new Widget(), '[Widget]'],
    ['an instance of an anonymous class', new (class {})(), '[Object]'],
    ['a toJSON that throws', new Thrower(), '[Thrower]'],
    ['a toJSON returning a non-string', new Self(), '[Self]'],
    ['a named function', named, '[function greet]'],
    [
      'an anonymous function',
      (
        () => () =>
          1
      )(),
      '[function]',
    ],
    ['a symbol', Symbol('tag'), '[Symbol(tag)]'],
    ['a bigint', BigInt(12), '[bigint 12]'],
    ['NaN', NaN, '[NaN]'],
    ['Infinity', Infinity, '[Infinity]'],
    ['-Infinity', -Infinity, '[-Infinity]'],
    ['-0', -0, '[-0]'],
    ['undefined', undefined, '[undefined]'],
  ])('%s', (_, value, printed) => {
    expect(constantOf([value]).value).toEqual([printed])
  })

  test('JSON values pass through unchanged', () => {
    const value = { s: 'x', n: 1.5, zero: 0, t: true, nil: null, list: [1, [2]], nested: { a: {} } }
    expect(constantOf(value).value).toEqual(value)
  })

  test('an unassigned array slot converts as undefined does', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(constantOf([1, , 3]).value).toEqual([1, '[undefined]', 3])
  })

  test('a cycle is cut where it closes', () => {
    expect(constantOf(cyclic).value).toEqual({ a: 1, self: '[circular]' })
  })

  test('nesting past the walk ceiling is cut there', () => {
    let deep: unknown = 'bottom'
    for (let level = 0; level < 600; level++) deep = [deep]
    expect(JSON.stringify(constantOf(deep).value)).toContain('"[too deep]"')
  })

  test('a cyclic source still reports: the compile stops at its ceiling', () => {
    const source: Record<string, unknown> = { x: '$data.x' }
    source.me = source
    const result = report(source)
    expect(result.expression).toMatchObject({ x: '$data.x', me: '[circular]' })
    expect(result.issues.some((issue) => issue.code === ErrorCodes.depthCeiling)).toBe(true)
  })

  test('an opaque constant folded into a skeleton prints as its marker in the shape', () => {
    const { canonicalForm } = report({ when: new Date('2026-09-23T00:00:00Z'), x: '$data.x' })
    expect(canonicalForm).toMatchObject({
      shape: { when: '[Date 2026-09-23T00:00:00.000Z]', x: '<hole>' },
    })
  })

  test('undefined in the source against the compile: dropped, nulled, or kept in a literal', () => {
    const result = report({
      note: undefined,
      list: [1, undefined, '$data.x'],
      kept: { $literal: { discount: undefined } },
    })
    expect(result.expression).toEqual({
      note: '[undefined]',
      list: [1, '[undefined]', '$data.x'],
      kept: { $literal: { discount: '[undefined]' } },
    })
    expect(result.canonicalForm).toMatchObject({
      shape: { list: [1, null, '<hole>'], kept: { discount: '[undefined]' } },
    })
    expect(result.canonicalForm).not.toHaveProperty('shape.note')
  })

  test('expression carries the same markers as the tree', () => {
    const result = report({ when: new Date('2026-09-23T00:00:00Z'), x: '$data.x' })
    expect(result.expression).toEqual({ when: '[Date 2026-09-23T00:00:00.000Z]', x: '$data.x' })
  })
})

// ── issues ──────────────────────────────────────────────────────────

describe('issues', () => {
  const expression = {
    greeting: { $greet: { name: '$data.customer.name' } },
    broken: { operator: 'flibble' },
    extras: { $colour: 'red' },
  }
  const options = { data: { customer: {} }, maxNodes: 1 }

  test("the list is validate()'s under the same options, entry for entry", () => {
    const fig = build(options)
    const listed = inspect(fig.compile(expression)).issues.map((entry) => {
      const issue = { ...entry }
      delete issue.order
      return issue
    })
    expect(listed).toEqual(fig.validate(expression).issues)
    // All three kinds are present, so the comparison is not vacuous
    expect(listed.map((issue) => issue.code)).toEqual([
      ErrorCodes.maxNodesExceeded,
      ErrorCodes.unknownOperator,
      ErrorCodes.unrecognizedIdentifier,
      ErrorCodes.missingDataPath,
    ])
  })

  test('order is on exactly the compile-stream entries', () => {
    const fig = build(options)
    const compiled = fig.compile(expression)
    const { issues } = inspect(compiled)
    expect(issues.filter((issue) => issue.order !== undefined)).toHaveLength(compiled.issues.length)
    expect(issues[0]).not.toHaveProperty('order')
    expect(issues[issues.length - 1]).not.toHaveProperty('order')
  })

  test("an issue's order can name a value with no node", () => {
    const { canonicalForm, issues } = report(expression)
    const stray = issues.find((issue) => issue.code === ErrorCodes.unrecognizedIdentifier)
    expect(stray?.order).toEqual(expect.any(Number))
    expect(nodesOf(canonicalForm).has(stray?.order as number)).toBe(false)
  })

  test("the call's data is laid over the pinned options, as validate() does it", () => {
    const fig = build()
    const compiled = fig.compile({ x: '$data.x', y: '$data.y' })
    const result = inspect(compiled, { data: { x: 1 } })
    expect(result.issues).toEqual(
      fig.validate({ x: '$data.x', y: '$data.y' }, { data: { x: 1 } }).issues
    )
    expect(result.options).toEqual({ data: '[supplied: 1 top-level key]' })
    expect(inspect(compiled).issues).toEqual([])
  })

  test('a call option that is instance configuration is refused', () => {
    const compiled = build().compile({ x: '$data.x' })
    expect(() => inspect(compiled, { maxDepth: 3 } as never)).toThrow(FigTreeError)
    try {
      inspect(compiled, { maxDepth: 3 } as never)
    } catch (error) {
      expect((error as FigTreeError).code).toBe(ErrorCodes.invalidOptions)
    }
  })
})

// ── options ─────────────────────────────────────────────────────────

describe('options', () => {
  test('only the options that are set', () => {
    expect(inspect(new FigTree().compile({ x: '$data.x' })).options).toEqual({})
  })

  test('data counted, headers redacted, machinery as present, the rest as they are', () => {
    const { options } = report(
      { x: '$data.x' },
      {
        data: { a: 1, b: 2 },
        maxNodes: 50,
        strictDataPaths: true,
        operatorDefaults: { join: { delimiter: '-' } },
        http: {
          baseEndpoint: 'https://api.example.com',
          headers: { Authorization: 'Bearer s3cret' },
        },
        graphQL: { endpoint: 'https://gql.example.com', headers: { 'X-Key': 'k' } },
        signal: new AbortController().signal,
        cache: {
          maxSize: 10,
          store: { get: () => undefined, set: () => {}, delete: () => {}, clear: () => {} },
        },
      }
    )
    expect(options).toEqual({
      data: '[supplied: 2 top-level keys]',
      maxNodes: 50,
      strictDataPaths: true,
      operatorDefaults: { join: { delimiter: '-' } },
      http: { baseEndpoint: 'https://api.example.com', headers: { Authorization: '[redacted]' } },
      graphQL: { endpoint: 'https://gql.example.com', headers: { 'X-Key': '[redacted]' } },
      signal: '[supplied]',
      cache: { maxSize: 10, store: '[supplied]' },
    })
    expect(JSON.stringify(options)).not.toContain('s3cret')
  })

  test('a handle reports the snapshot it compiled under', () => {
    const fig = build({ maxNodes: 50 })
    const compiled = fig.compile({ x: '$data.x' })
    fig.updateOptions({ maxNodes: 1 })
    expect(inspect(compiled).options).toEqual({ maxNodes: 50 })
    expect(inspect(compiled).issues).toEqual([])
    expect(inspect(fig.compile({ x: '$data.x' })).options).toEqual({ maxNodes: 1 })
  })
})

// ── dependencies and own ────────────────────────────────────────────

describe('dependencies', () => {
  test('the canonical renders, in the order the compile met them', () => {
    const fig = build()
    const expression = { b: '$data.z', a: '$data.a.b' }
    expect(inspect(fig.compile(expression)).dependencies).toEqual({
      dataPaths: ['z', 'a.b'],
      dynamic: false,
      operators: [],
      fragments: [],
    })
    // getDependencies() spells them alike, and sorts; the record does not
    expect(fig.getDependencies(expression).data.paths).toEqual(['a.b', 'z'])
  })

  test('the projection and a key literally named "[*]" stay apart', () => {
    const { dependencies } = report({
      projected: '$data.items[*].id',
      literal: { $get: { path: ['items', '[*]', 'id'] } },
    })
    expect(dependencies.dataPaths).toEqual(['items[*].id', 'items["[*]"].id'])
  })

  test('composed through fragment calls; own is the expression alone', () => {
    const fig = new FigTree({
      operators: [coreOperators],
      fragments: {
        outer: { expression: { $join: ['Hello, ', { $inner: {} }] } },
        inner: { expression: { $join: ['$data.first', ' ', '$data.last'] } },
      },
    })
    const result = inspect(fig.compile({ greeting: { $outer: {} }, x: '$data.x' }))
    expect(result.dependencies).toEqual({
      dataPaths: ['x', 'first', 'last'],
      dynamic: false,
      operators: ['join'],
      fragments: ['outer', 'inner'],
    })
    expect(result.own).toEqual({
      nodeCount: 2,
      maxDepth: 1,
      dependencies: { dataPaths: ['x'], dynamic: false, operators: [], fragments: ['outer'] },
    })
    expect(result.nodeCount).toBeGreaterThan(result.own.nodeCount)
  })
})

// ── Inert handles ───────────────────────────────────────────────────

describe('inert handles', () => {
  test('a constant container is one constant node', () => {
    const result = report({ a: 1, b: [2] })
    expect(result.canonicalForm).toEqual({
      order: 0,
      kind: 'constant',
      path: [],
      value: { a: 1, b: [2] },
    })
    expect(result).toMatchObject({ issues: [], nodeCount: 0, timeoutShielded: true })
  })

  test('the probe calls { $flibble: 1 } inert, and the report still has its warning', () => {
    const { issues } = report({ $flibble: 1 })
    expect(issues.map((issue) => issue.code)).toEqual([ErrorCodes.unrecognizedIdentifier])
  })

  test('a primitive', () => {
    expect(report(5).canonicalForm).toEqual({ order: 0, kind: 'constant', path: [], value: 5 })
  })
})

// ── Purity and ownership ────────────────────────────────────────────

describe('purity and ownership', () => {
  const deepFreeze = <T>(value: T): T => {
    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze)
      Object.freeze(value)
    }
    return value
  }

  test('the expression is never written to', () => {
    const expression = deepFreeze({
      a: { $plus: [1, '$data.x'], fallback: 0 },
      b: [{ $greet: { name: '$data.n' } }, 'text'],
    })
    const before = JSON.stringify(expression)
    expect(() => report(expression, { data: { x: 1 } })).not.toThrow()
    expect(JSON.stringify(expression)).toBe(before)
  })

  test('the report shares nothing with the artifact: changing one leaves the next alone', () => {
    const compiled = build().compile({
      a: { $plus: [1, '$data.x'], fallback: 0 },
      b: '$data.items[*].id',
    })
    const first = inspect(compiled)
    const second = inspect(compiled)
    expect(second).toEqual(first)
    const pristine = JSON.parse(JSON.stringify(first))
    // Scribble on every array and object the first report holds
    const scribble = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(scribble)
        value.push('scribbled')
      } else if (value !== null && typeof value === 'object') {
        Object.values(value).forEach(scribble)
        ;(value as Record<string, unknown>).scribbled = true
      }
    }
    scribble(first)
    expect(inspect(compiled)).toEqual(pristine)
    expect(compiled.issues).toEqual([])
  })

  test('anything but a handle is refused', () => {
    const fig = new FigTree()
    for (const value of [{}, null, 5, fig, { expression: 1 }])
      expect(() => inspect(value as never)).toThrow(TypeError)
  })
})
