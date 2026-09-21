/**
 * Chunk 5.1 — `vars` at runtime ("$vars — lexical, lazy, memoized" in
 * docs-dev/v3-specs/v3-api.md; "vars on plain object literals" in the Node
 * grammar; fallback rule 5 in "fallback semantics").
 *
 * The assertion throughout is a count. Lazy, memoized and shared-in-flight
 * are all the same observable claim — the body ran at most once — so every
 * var here is a spy and the test reads its call log.
 */
import { defineOperator, FigTree, FigTreeError } from '../src'
import { boomOp, echoOp, spyOp } from './fixtures/evalOperators'

const rejection = async (promise: Promise<unknown>): Promise<FigTreeError> => {
  try {
    await promise
  } catch (error) {
    return error as FigTreeError
  }
  throw new Error('expected a rejection')
}

/** A spy with no parameters, answering `result` — one var's worth of work. */
const source = (name: string, result: unknown) => spyOp(name, {}, { result })

// ── lazy, memoized, shared ──────────────────────────────────────────

describe('a var evaluates at most once, and only if referenced', () => {
  test('two references, one evaluation', async () => {
    const a = source('a', 7)
    const fig = new FigTree({ operators: [a.definition, echoOp()] })
    const result = await fig.evaluate({
      vars: { n: { $a: {} } },
      first: '$vars.n',
      second: '$vars.n',
    })
    expect(result).toEqual({ first: 7, second: 7 })
    expect(a.calls).toHaveLength(1)
  })

  test('parallel branches share the one in-flight evaluation', async () => {
    const a = source('a', 'shared')
    const fig = new FigTree({ operators: [a.definition, echoOp()] })
    // Sibling holes evaluate concurrently, so both demands are in flight
    // before either settles — they must await the same promise, not race
    // to start a second one
    await fig.evaluate({
      vars: { n: { $a: {} } },
      one: { $echo: '$vars.n' },
      two: { $echo: '$vars.n' },
      three: { $echo: '$vars.n' },
    })
    expect(a.calls).toHaveLength(1)
  })

  test('a declared but unreferenced var never evaluates', async () => {
    const used = source('used', 1)
    const unused = source('unused', 2)
    const fig = new FigTree({
      operators: [used.definition, unused.definition, echoOp()],
    })
    await fig.evaluate({
      vars: { a: { $used: {} }, b: { $unused: {} } },
      value: '$vars.a',
    })
    expect(used.calls).toHaveLength(1)
    expect(unused.calls).toHaveLength(0)
  })
})

// ── the chain: shadowing, siblings, outer scopes ────────────────────

describe('the scope chain', () => {
  const fig = () => new FigTree({ operators: [echoOp()] })

  test('an inner block shadows an outer name', async () => {
    expect(
      await fig().evaluate({
        vars: { label: 'outer' },
        nested: { vars: { label: 'inner' }, value: '$vars.label' },
        plain: '$vars.label',
      })
    ).toEqual({ nested: { value: 'inner' }, plain: 'outer' })
  })

  test('a var may reference a sibling in the same block', async () => {
    expect(
      await fig().evaluate({
        vars: { base: 'https://x.test', url: { $echo: '$vars.base' } },
        value: '$vars.url',
      })
    ).toEqual({ value: 'https://x.test' })
  })

  test('a var may reference an outer scope', async () => {
    expect(
      await fig().evaluate({
        vars: { host: 'x.test' },
        inner: { vars: { url: { $echo: '$vars.host' } }, value: '$vars.url' },
      })
    ).toEqual({ inner: { value: 'x.test' } })
  })

  test('a drill miss throws under strictDataPaths, like a data path', async () => {
    // One strict-path rule across every namespace (ruled September 2026):
    // authoring-time path checking, the strongest typo mitigation, exists
    // for $data alone — so the runtime throw is the only protection a var
    // drill can have, which argues for extending it rather than withholding
    const expression = {
      vars: { user: { $echo: { value: { name: 'Ada' } } } },
      value: '$vars.user.nickname',
    }
    expect(await fig().evaluate(expression)).toEqual({ value: null })

    const error = await rejection(fig().evaluate(expression, { strictDataPaths: true }))
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.code).toBe('missing-data-path')
  })

  test('a fallback catches that failure, as it does a data-path miss', async () => {
    expect(
      await fig().evaluate(
        {
          operator: 'echo',
          vars: { user: { $echo: { value: { name: 'Ada' } } } },
          value: '$vars.user.nickname',
          fallback: 'Anonymous',
        },
        { strictDataPaths: true }
      )
    ).toBe('Anonymous')
  })

  test('the value can be drilled into, and a miss is null not a failure', async () => {
    const result = await fig().evaluate({
      vars: { user: { $echo: { value: { name: { first: 'Ada' }, tags: ['x', 'y'] } } } },
      first: '$vars.user.name.first',
      second: '$vars.user.tags[1]',
      missing: '$vars.user.name.middle',
    })
    expect(result).toEqual({ first: 'Ada', second: 'y', missing: null })
  })
})

// ── the plain-literal placement ─────────────────────────────────────

describe('vars on a plain object literal', () => {
  const fig = () => new FigTree({ operators: [echoOp()] })

  test('scopes the subtree and is consumed from the output', async () => {
    expect(
      await fig().evaluate({
        vars: { title: 'Report' },
        heading: '$vars.title',
        static: 'untouched',
      })
    ).toEqual({ heading: 'Report', static: 'untouched' })
  })

  test('a block with no other keys evaluates to an empty object', async () => {
    expect(await fig().evaluate({ vars: { a: 1 } })).toEqual({})
  })

  test('it reaches arbitrarily deep, across nested literals', async () => {
    expect(
      await fig().evaluate({
        vars: { n: 3 },
        sections: [{ rows: [{ count: '$vars.n' }] }],
      })
    ).toEqual({ sections: [{ rows: [{ count: 3 }] }] })
  })
})

// ── fallback rule 5 ─────────────────────────────────────────────────

describe('rule 5 — a fallback evaluates in its node’s own scope', () => {
  const build = () => {
    const risky = spyOp('risky', {}, { result: null })
    return { risky, fig: new FigTree({ operators: [risky.definition, echoOp(), boomOp()] }) }
  }

  test('the node’s vars are visible to its fallback', async () => {
    const { fig } = build()
    expect(
      await fig.evaluate({
        operator: 'echo',
        vars: { safe: 'from the scope' },
        value: { $boom: 1 },
        fallback: '$vars.safe',
      })
    ).toBe('from the scope')
  })

  test('a fallback referencing the failed var re-receives its rejection', async () => {
    const { fig } = build()
    // The recorded corner: the memoized rejection is what the fallback
    // gets, so the fallback fails too and rule 4 takes over
    const error = await rejection(
      fig.evaluate({
        operator: 'echo',
        vars: { risky: { $boom: 'inside the var' } },
        value: '$vars.risky',
        fallback: '$vars.risky',
      })
    )
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.cause).toBeInstanceOf(FigTreeError)
  })

  test('the failing var is evaluated once, not once per demand', async () => {
    // Rejections memoize like values: two demands, one attempt
    let calls = 0
    const alwaysFails = defineOperator({
      name: 'alwaysFails',
      category: 'other',
      description: 'Count attempts, then fail',
      parameters: {},
      evaluate: () => {
        calls += 1
        throw new Error('nope')
      },
    })
    const fig = new FigTree({ operators: [alwaysFails, echoOp()] })
    await rejection(
      fig.evaluate({
        operator: 'echo',
        vars: { risky: { $alwaysFails: {} } },
        value: '$vars.risky',
        fallback: '$vars.risky',
      })
    )
    expect(calls).toBe(1)
  })

  test('a fallback independent of the failing var still succeeds', async () => {
    const { fig } = build()
    expect(
      await fig.evaluate({
        operator: 'echo',
        vars: { risky: { $boom: 1 } },
        value: '$vars.risky',
        fallback: 'independent',
      })
    ).toBe('independent')
  })
})
