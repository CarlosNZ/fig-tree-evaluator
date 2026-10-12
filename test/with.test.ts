/**
 * `with(update)` — a derived instance ("with()" in
 * docs-dev/v3-specs/v3-evaluator-methods.md): this instance's state with
 * the update applied as `updateOptions()` would apply it, and this instance
 * untouched.
 *
 * Registry and compile-cache reuse is read the way compile-cache.test.ts
 * reads it, through a compile counter; the result store through a caching
 * operator's body-run count.
 */
import { FigTree, ErrorCodes, coreOperators, defineOperator, isFigTreeError } from '../src'
import type { EvaluationResult, FigTreeError, FragmentDefinition, TraceNode } from '../src'
import { compileSpyOp } from './fixtures/evalOperators'
import { makeOp } from './fixtures/registryOptions'
import { RecordingCacheStore } from './helpers'

const fragments: Record<string, FragmentDefinition> = {
  double: {
    expression: { $plus: ['$params.n', '$params.n'] },
    parameters: { n: { type: 'number' } },
  },
}

const draft: FragmentDefinition = {
  expression: { $join: { values: ['$params.greeting', '$params.name'], delimiter: ' ' } },
  parameters: { greeting: { type: 'string', default: 'Hello' }, name: { type: 'string' } },
}

/** A caching operator, keying its one unit on its one parameter. */
const countedOp = () => {
  let runs = 0
  const definition = defineOperator({
    name: 'cached',
    category: 'other',
    parameters: { value: { type: 'any', nullPolicy: 'value', default: null } },
    positionalParams: ['value'],
    cache: true,
    evaluate: ({ value }, context) =>
      context.cache.memo(value, async () => {
        runs += 1
        return `${String(value)}:${runs}`
      }),
  })
  return { definition, runs: () => runs }
}

const withInvalid = (fig: FigTree, update: Parameters<FigTree['with']>[0]): FigTreeError => {
  try {
    fig.with(update)
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected with() to throw')
}

const flatten = (node: TraceNode): TraceNode[] => [node, ...(node.children ?? []).flatMap(flatten)]

const names = (fig: FigTree) => fig.getFragments().map((fragment) => fragment.name)

describe('the original is untouched', () => {
  it('reports the same fragments, options and results before and after', async () => {
    const fig = new FigTree({ operators: [coreOperators], fragments, data: { n: 3 }, timeout: 500 })
    const expression = { $double: { n: '$data.n' } }
    const before = {
      fragments: fig.getFragments(),
      options: fig.getOptions(),
      result: await fig.evaluate(expression),
    }

    fig.with({ fragments: { draft, double: null }, data: { n: 10 }, timeout: null })

    expect(fig.getFragments()).toEqual(before.fragments)
    expect(fig.getOptions()).toEqual(before.options)
    expect(await fig.evaluate(expression)).toBe(before.result)
  })

  it('returns an instance of the same class', () => {
    const fig = new FigTree()
    const derived = fig.with({})
    expect(derived).toBeInstanceOf(FigTree)
    expect(derived).not.toBe(fig)
    expect(derived.version).toBe(fig.version)
  })
})

describe('an added fragment', () => {
  it('is callable on the derived instance and not on the original', async () => {
    const fig = new FigTree({ operators: [coreOperators], fragments })
    const derived = fig.with({ fragments: { draft } })
    expect(await derived.evaluate({ $draft: { name: 'Carl' } })).toBe('Hello Carl')
    await expect(fig.evaluate({ $draft: { name: 'Carl' } })).rejects.toMatchObject({
      code: ErrorCodes.unrecognizedIdentifier,
    })
  })

  it('evaluates as a real call: defaults, null-as-unset and the trace source', async () => {
    const fig = new FigTree({ operators: [coreOperators], fragments })
    const derived = fig.with({ fragments: { __draft: draft } })
    const { result, trace } = (await derived.evaluate(
      { fragment: '__draft', parameters: { greeting: '$data.greeting', name: 'Carl' } },
      { trace: true, data: { greeting: null } }
    )) as EvaluationResult
    expect(result).toBe('Hello Carl')
    expect(flatten(trace).some((entry) => entry.source?.fragment === '__draft')).toBe(true)
  })
})

describe('the merge rule', () => {
  it('merges fragments by name', () => {
    const fig = new FigTree({ operators: [coreOperators], fragments })
    expect(names(fig.with({ fragments: { draft } }))).toEqual(['double', 'draft'])
  })

  it('removes a fragment named null', () => {
    const fig = new FigTree({ operators: [coreOperators], fragments: { ...fragments, draft } })
    expect(names(fig.with({ fragments: { double: null } }))).toEqual(['draft'])
  })

  it('replaces operators wholesale', async () => {
    const fig = new FigTree({ operators: [coreOperators, makeOp('alpha')] })
    const derived = fig.with({ operators: [coreOperators, makeOp('beta')] })
    const operatorNames = (instance: FigTree) => instance.getOperators().map(({ name }) => name)
    expect(operatorNames(derived)).toContain('beta')
    expect(operatorNames(derived)).not.toContain('alpha')
    expect(operatorNames(fig)).toContain('alpha')
  })
})

describe('a registration error', () => {
  it('throws with every issue at its fragments path, and leaves the original alone', async () => {
    const pair: Record<string, FragmentDefinition> = {
      inner: { expression: 1 },
      twice: { expression: [{ $inner: {} }, { wrapped: { $inner: {} } }] },
    }
    const fig = new FigTree({ fragments: pair })
    const error = withInvalid(fig, { fragments: { inner: null } })
    expect(error.code).toBe(ErrorCodes.invalidOptions)
    expect(error.issues?.map((issue) => issue.path)).toEqual([
      ['fragments', 'twice', 'expression', 0, '$inner'],
      ['fragments', 'twice', 'expression', 1, 'wrapped', '$inner'],
    ])
    expect(names(fig)).toEqual(['inner', 'twice'])
    expect(await fig.evaluate({ $twice: {} })).toEqual([1, { wrapped: 1 }])
  })

  it('throws on a malformed cache block, as updateOptions does', () => {
    const fig = new FigTree()
    expect(withInvalid(fig, { cache: { maxSize: 0 } }).code).toBe(ErrorCodes.invalidOptions)
  })
})

describe('the registry and the compile cache', () => {
  const rig = () => {
    const spy = compileSpyOp()
    const fig = new FigTree({ operators: [coreOperators, spy.definition] })
    return { fig, spy }
  }

  it('are carried across by an update that does not touch the registry', async () => {
    const { fig, spy } = rig()
    const expression = { $counted: 'x' }
    await fig.evaluate(expression)
    spy.reset()
    const derived = fig.with({ maxNodes: 500, data: { a: 1 } })
    expect(await derived.evaluate(expression)).toBe('x')
    expect(spy.compiles()).toBe(0)
  })

  it('are rebuilt by an update that does', async () => {
    const { fig, spy } = rig()
    const expression = { $counted: 'x' }
    await fig.evaluate(expression)
    spy.reset()
    await fig.with({ fragments: {} }).evaluate(expression)
    expect(spy.compiles()).toBe(1)
    // ...and the original's cache is still warm
    await fig.evaluate(expression)
    expect(spy.compiles()).toBe(1)
  })
})

describe('the result store', () => {
  it('is the derived instance’s own: neither reads what the other cached', async () => {
    const counted = countedOp()
    const fig = new FigTree({ operators: [counted.definition] })
    const derived = fig.with({ fragments: { draft: { expression: { $cached: 1 } } } })
    expect(await fig.evaluate({ $cached: 1 })).toBe('1:1')
    expect(await derived.evaluate({ $draft: {} })).toBe('1:2')
    expect(await derived.evaluate({ $cached: 2 })).toBe('2:3')
    expect(await fig.evaluate({ $cached: 2 })).toBe('2:4')
    // ...while each still serves its own entries
    expect(await fig.evaluate({ $cached: 1 })).toBe('1:1')
    expect(await derived.evaluate({ $cached: 2 })).toBe('2:3')
    expect(counted.runs()).toBe(4)
  })

  it('starts empty, whatever the original had cached', async () => {
    const counted = countedOp()
    const fig = new FigTree({ operators: [counted.definition] })
    await fig.evaluate({ $cached: 1 })
    await fig.with({}).evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(2)
  })

  it('clears apart: clearCache() on either leaves the other’s entries', async () => {
    const counted = countedOp()
    const fig = new FigTree({ operators: [counted.definition] })
    const derived = fig.with({})
    await fig.evaluate({ $cached: 1 })
    await derived.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(2)
    derived.clearCache()
    await fig.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(2)
    fig.clearCache()
    await derived.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(3)
  })

  it('is built from the merged cache block, leaving the original’s configuration alone', async () => {
    const counted = countedOp()
    const fig = new FigTree({ operators: [counted.definition], cache: { maxSize: 1 } })
    const derived = fig.with({ cache: { maxSize: 4 } })
    // The original keeps its maxSize of one: a second key evicts the first
    await fig.evaluate({ $cached: 1 })
    await fig.evaluate({ $cached: 2 })
    await fig.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(3)
    // ...where the derived store holds both
    await derived.evaluate({ $cached: 1 })
    await derived.evaluate({ $cached: 2 })
    await derived.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(5)
  })

  it('is not reconfigured by a later cache update on the original', async () => {
    const counted = countedOp()
    const fig = new FigTree({ operators: [counted.definition], cache: { maxSize: 4 } })
    const derived = fig.with({})
    await derived.evaluate({ $cached: 1 })
    await derived.evaluate({ $cached: 2 })
    fig.updateOptions({ cache: { maxSize: 1 } })
    // The derived instance's store keeps its size of four
    await derived.evaluate({ $cached: 3 })
    await derived.evaluate({ $cached: 1 })
    await derived.evaluate({ $cached: 2 })
    expect(counted.runs()).toBe(3)
  })

  it('keeps an entry the original cleared unreadable through a host store they share', async () => {
    // A store whose `clear` never lands: the generation alone invalidates
    const store = new RecordingCacheStore()
    store.clear = () => undefined
    const counted = countedOp()
    const fig = new FigTree({ operators: [counted.definition], cache: { store } })
    await fig.evaluate({ $cached: 1 })
    fig.clearCache()
    await fig.with({}).evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(2)
  })
})

describe('a later updateOptions()', () => {
  it('on the original does not reach the derived instance', async () => {
    const fig = new FigTree({ operators: [coreOperators], fragments, data: { n: 2 } })
    const derived = fig.with({ fragments: { draft } })
    fig.updateOptions({ fragments: { double: null }, data: { n: 5 } })
    expect(names(derived)).toEqual(['double', 'draft'])
    expect(await derived.evaluate({ $double: { n: '$data.n' } })).toBe(4)
    expect(derived.getOptions().data).toEqual({ n: 2 })
  })

  it('on the derived instance does not reach the original', async () => {
    const fig = new FigTree({ operators: [coreOperators], fragments })
    const derived = fig.with({})
    derived.updateOptions({ fragments: { draft }, timeout: 100 })
    expect(names(fig)).toEqual(['double'])
    expect(fig.getOptions().timeout).toBeUndefined()
  })
})
