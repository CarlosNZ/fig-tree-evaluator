/**
 * `operatorSet()` — selecting from operator sets and replacing operators by
 * name (docs-dev/v3-specs/v3-operator-set.md): the selection order, the
 * replacement rules, and every row of its Checks table.
 */
import {
  FigTree,
  coreOperators,
  operatorSet,
  defineOperator,
  isFigTreeError,
  ErrorCodes,
  type FigTreeError,
  type OperatorCategory,
  type ValidatedOperatorDefinition,
} from '../src'

/** A minimal branded operator in a given category, fresh per call. */
const op = (
  name: string,
  category: OperatorCategory = 'other',
  alias?: string
): ValidatedOperatorDefinition =>
  defineOperator({
    name,
    ...(alias !== undefined ? { alias } : {}),
    category,
    parameters: {},
    evaluate: () => name,
  })

const myUpper = defineOperator({
  name: 'upper',
  category: 'string',
  parameters: { value: { type: 'string' } },
  positionalParams: ['value'],
  evaluate: ({ value }) => `UPPER:${value}`,
})
const myRound = op('round', 'math')
const ioOperators = [op('http', 'io'), op('graphQL', 'io')]
const myNewOperator = op('myNewOperator')

const names = (operators: ValidatedOperatorDefinition[]) => operators.map(({ name }) => name)
const coreNames = names(coreOperators)
const inCategory = (category: OperatorCategory) =>
  coreOperators.filter((definition) => definition.category === category).map(({ name }) => name)

const invalidCall = (call: () => unknown): FigTreeError => {
  try {
    call()
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected operatorSet to throw')
}

const issuesOf = (error: FigTreeError) =>
  (error.issues ?? []).map(({ code, path, message }) => ({ code, path, message }))

describe('operatorSet — selection', () => {
  it('leaves out an operator by name', () => {
    expect(names(operatorSet(coreOperators, { except: 'regex' }))).toEqual(
      coreNames.filter((name) => name !== 'regex')
    )
  })

  it('keeps just the categories and names `only` selects, in input order', () => {
    const result = operatorSet(coreOperators, {
      only: [{ category: 'math' }, { category: 'comparison' }, 'if'],
    })
    expect(names(result)).toEqual(
      coreNames.filter(
        (name) =>
          name === 'if' || inCategory('math').concat(inCategory('comparison')).includes(name)
      )
    )
  })

  it('removes a category less its own `except`, alongside a name', () => {
    const result = operatorSet(coreOperators, {
      except: [{ category: 'string', except: 'buildString' }, 'and'],
    })
    const removed = inCategory('string').filter((name) => name !== 'buildString')
    expect(names(result)).toEqual(
      coreNames.filter((name) => name !== 'and' && !removed.includes(name))
    )
    expect(names(result)).toContain('buildString')
  })

  it('restricts and replaces across several sets', () => {
    const result = operatorSet(coreOperators, ioOperators, myNewOperator, {
      except: ['regex', 'graphQL'],
      replace: [myUpper, myRound],
    })
    expect(names(result)).toEqual([
      ...coreNames.filter((name) => name !== 'regex'),
      'http',
      'myNewOperator',
    ])
    expect(result).toContain(myUpper)
    expect(result).toContain(myRound)
  })

  it('applies only, except and replace in that order, however they are written', () => {
    const written = { replace: myUpper, except: 'lower', only: { category: 'string' as const } }
    const ordered = { only: { category: 'string' as const }, except: 'lower', replace: myUpper }
    expect(operatorSet(coreOperators, written)).toEqual(operatorSet(coreOperators, ordered))
  })

  it('takes the union of overlapping selectors', () => {
    const result = operatorSet(coreOperators, {
      only: [{ category: 'math' }, 'plus', 'round'],
      except: ['round', { category: 'math', except: ['plus', 'subtract'] }],
    })
    expect(names(result)).toEqual(['plus', 'subtract'])
  })

  it("applies `only` to the host's own operators too", () => {
    expect(
      names(operatorSet(coreOperators, myNewOperator, { only: { category: 'math' } }))
    ).toEqual(inCategory('math'))
    const result = operatorSet(coreOperators, ioOperators, myNewOperator, {
      only: [{ category: 'io' }, 'myNewOperator'],
    })
    expect(names(result)).toEqual(['http', 'graphQL', 'myNewOperator'])
  })

  it('changes nothing for {}, an empty except, or absent option values', () => {
    expect(operatorSet(coreOperators, {})).toEqual(coreOperators)
    expect(operatorSet(coreOperators, { except: [] })).toEqual(coreOperators)
    expect(
      operatorSet(coreOperators, { only: undefined, except: undefined, replace: undefined })
    ).toEqual(coreOperators)
  })
})

describe('operatorSet — the result and the input', () => {
  it('returns a new flat array of the same definitions', () => {
    const result = operatorSet(coreOperators, ioOperators, { except: 'regex' })
    expect(result).not.toBe(coreOperators)
    expect(result.every((definition) => !Array.isArray(definition))).toBe(true)
    result.forEach((definition) =>
      expect([...coreOperators, ...ioOperators].includes(definition)).toBe(true)
    )
  })

  it('never changes the input arrays', () => {
    const core = [...coreOperators]
    const io = [...ioOperators]
    operatorSet(coreOperators, ioOperators, {
      only: [{ category: 'string' }, { category: 'io' }],
      except: 'graphQL',
      replace: myUpper,
    })
    expect(coreOperators).toHaveLength(core.length)
    expect(coreOperators.every((definition, i) => definition === core[i])).toBe(true)
    expect(ioOperators).toHaveLength(io.length)
    expect(ioOperators.every((definition, i) => definition === io[i])).toBe(true)
  })
})

describe('operatorSet — replacing', () => {
  it('puts a replacement at the position of the operator it replaces', () => {
    const result = operatorSet(coreOperators, { replace: myUpper })
    expect(names(result)).toEqual(coreNames)
    expect(result[coreNames.indexOf('upper')]).toBe(myUpper)
  })

  it('brings its own alias or none, so an unaliased replacement retires the alias', async () => {
    const myPlus = defineOperator({
      name: 'plus',
      category: 'math',
      parameters: { values: { type: 'array' } },
      positionalParams: ['...values'],
      evaluate: ({ values }) => (values as number[]).reduce((sum, value) => sum + value, 0),
    })
    const fig = new FigTree({ operators: operatorSet(coreOperators, { replace: myPlus }) })
    expect(await fig.evaluate({ operator: 'plus', values: [1, 2] })).toBe(3)
    await expect(fig.evaluate({ operator: '+', values: [1, 2] })).rejects.toMatchObject({
      code: ErrorCodes.unknownOperator,
    })
  })

  it("may change category, and category selectors see the original's", () => {
    const otherUpper = op('upper', 'other')
    expect(
      operatorSet(coreOperators, { only: { category: 'string' }, replace: otherUpper })
    ).toContain(otherUpper)
    const error = invalidCall(() =>
      operatorSet(coreOperators, { except: { category: 'string' }, replace: otherUpper })
    )
    expect(issuesOf(error)).toEqual([
      {
        code: ErrorCodes.invalidOptions,
        path: ['replace'],
        message: "'upper' is replaced but also removed by 'except'",
      },
    ])
  })

  it('evaluates through the replacement', async () => {
    const fig = new FigTree({ operators: operatorSet(coreOperators, { replace: myUpper }) })
    expect(await fig.evaluate({ $upper: 'hi' })).toBe('UPPER:hi')
  })
})

/** One row per row of the spec's Checks table. */
const checks: {
  id: string
  call: () => unknown
  code: string
  path: (string | number)[]
  message: string
}[] = [
  {
    id: 'a name selector naming no operator in the input',
    call: () => operatorSet(coreOperators, { except: 'uper' }),
    code: ErrorCodes.unknownOperator,
    path: ['except'],
    message: "'uper' names no operator in the input — did you mean 'upper'?",
  },
  {
    id: 'a name selector that is an alias',
    call: () => operatorSet(coreOperators, { except: ['regex', '+'] }),
    code: ErrorCodes.invalidOptions,
    path: ['except', 1],
    message: "selectors take canonical names — use 'plus', not its alias '+'",
  },
  {
    id: 'a category with no operators in the input',
    call: () => operatorSet(coreOperators, { only: { category: 'io' } }),
    code: ErrorCodes.invalidOptions,
    path: ['only'],
    message: "no operator in the input has category 'io'",
  },
  {
    id: "a category's except naming an operator outside that category",
    call: () => operatorSet(coreOperators, { except: [{ category: 'string', except: 'round' }] }),
    code: ErrorCodes.invalidOptions,
    path: ['except', 0, 'except'],
    message: "'round' is not in category 'string'",
  },
  {
    id: 'a category selector whose except leaves nothing of the category',
    call: () =>
      operatorSet(op('get', 'data'), op('buildObject', 'data'), op('keep'), {
        except: { category: 'data', except: ['get', 'buildObject'] },
      }),
    code: ErrorCodes.invalidOptions,
    path: ['except'],
    message: "{ category: 'data', except: ['get', 'buildObject'] } selects nothing",
  },
  {
    id: "an except selector matching an operator that 'only' already left out",
    call: () => operatorSet(coreOperators, { only: { category: 'math' }, except: 'equal' }),
    code: ErrorCodes.invalidOptions,
    path: ['except'],
    message: "'equal' is not among the operators 'only' kept",
  },
  {
    id: 'a replacement whose name is not in the input',
    call: () => operatorSet(coreOperators, { replace: op('uper', 'string') }),
    code: ErrorCodes.unknownOperator,
    path: ['replace'],
    message: "'uper' names no operator in the input — to add a new operator, put it in the input",
  },
  {
    id: 'a replacement for an operator the selection removed',
    call: () => operatorSet(coreOperators, { except: 'upper', replace: myUpper }),
    code: ErrorCodes.invalidOptions,
    path: ['replace'],
    message: "'upper' is replaced but also removed by 'except'",
  },
  {
    id: "a replacement for an operator 'only' did not keep",
    call: () => operatorSet(coreOperators, { only: { category: 'math' }, replace: myUpper }),
    code: ErrorCodes.invalidOptions,
    path: ['replace'],
    message: "'upper' is replaced but also removed by 'only'",
  },
  {
    id: 'two replacements with one name',
    call: () => operatorSet(coreOperators, { replace: [myUpper, op('upper', 'string')] }),
    code: ErrorCodes.duplicateOperator,
    path: ['replace', 1],
    message: "two replacements for 'upper'",
  },
  {
    id: 'two operators with one name in the input',
    call: () => operatorSet(coreOperators, myUpper, {}),
    code: ErrorCodes.duplicateOperator,
    path: [1],
    message:
      "two operators named 'upper' in the input — to swap one for the other, pass it as 'replace'",
  },
  {
    id: 'the same definition twice in the input',
    call: () => operatorSet(coreOperators, coreOperators, {}),
    code: ErrorCodes.duplicateOperator,
    path: [1, 0],
    message: "two operators named 'and' in the input",
  },
  {
    id: 'an input argument that is a function',
    call: () => operatorSet(coreOperators, (() => ioOperators) as never, {}),
    code: ErrorCodes.invalidOptions,
    path: [1],
    message: 'arguments[1] is a function — factories must be called',
  },
  {
    id: 'an input argument that is a plain definition object',
    call: () => operatorSet([coreOperators[0], { name: 'x' } as never], {}),
    code: ErrorCodes.invalidOptions,
    path: [0, 1],
    message: 'arguments[0][1] must be built with defineOperator()',
  },
  {
    id: 'an input argument nested too deep',
    call: () => operatorSet([[myNewOperator]] as never, {}),
    code: ErrorCodes.invalidOptions,
    path: [0, 0],
    message: 'arguments[0][0] nests too deep — arrays are flattened one level only',
  },
  {
    id: 'a replacement that is not a branded definition',
    call: () => operatorSet(coreOperators, { replace: [myUpper, { name: 'lower' } as never] }),
    code: ErrorCodes.invalidOptions,
    path: ['replace', 1],
    message: 'replace[1] must be built with defineOperator()',
  },
  {
    id: 'an array inside the replace list',
    call: () => operatorSet(coreOperators, { replace: [[myUpper]] as never }),
    code: ErrorCodes.invalidOptions,
    path: ['replace', 0],
    message: "'replace' takes definitions, not arrays of them",
  },
  {
    id: 'no input arguments',
    call: () => (operatorSet as (...args: unknown[]) => unknown)({}),
    code: ErrorCodes.invalidOptions,
    path: [],
    message: 'operatorSet() needs at least one operator before its options',
  },
  {
    id: 'no arguments at all',
    call: () => (operatorSet as (...args: unknown[]) => unknown)(),
    code: ErrorCodes.invalidOptions,
    path: [],
    message: 'operatorSet() needs at least one operator before its options',
  },
  {
    id: 'a last argument that is an array (the options missing)',
    call: () => (operatorSet as (...args: unknown[]) => unknown)(coreOperators),
    code: ErrorCodes.invalidOptions,
    path: [0],
    message: 'the last argument must be the options object',
  },
  {
    id: 'a last argument that is a definition (the options missing)',
    call: () => (operatorSet as (...args: unknown[]) => unknown)(coreOperators, myUpper),
    code: ErrorCodes.invalidOptions,
    path: [1],
    message: 'the last argument must be the options object',
  },
  {
    id: 'a last argument that looks like an unbuilt definition',
    call: () =>
      (operatorSet as (...args: unknown[]) => unknown)(coreOperators, {
        name: 'x',
        evaluate: () => 1,
      }),
    code: ErrorCodes.invalidOptions,
    path: [1],
    message: "the last argument has 'name' and 'evaluate'",
  },
  {
    id: 'an unknown option key',
    call: () => operatorSet(coreOperators, { exclude: 'regex' } as never),
    code: ErrorCodes.invalidOptions,
    path: ['exclude'],
    message: "unknown option 'exclude' — the options are only, except and replace",
  },
  {
    id: 'a selector of the wrong shape',
    call: () => operatorSet(coreOperators, { except: ['regex', 42 as never] }),
    code: ErrorCodes.invalidOptions,
    path: ['except', 1],
    message: 'a selector is an operator name or { category, except? }',
  },
  {
    id: 'a category selector with an unknown key',
    call: () => operatorSet(coreOperators, { except: { category: 'math', drop: 'plus' } as never }),
    code: ErrorCodes.invalidOptions,
    path: ['except'],
    message: 'a selector is an operator name or { category, except? }',
  },
  {
    id: 'a result with no operators',
    call: () => operatorSet(coreOperators, { only: [] }),
    code: ErrorCodes.invalidOptions,
    path: [],
    message: 'the selection leaves no operators',
  },
]

describe('operatorSet — checks', () => {
  it.each(checks)('$id', ({ call, code, path, message }) => {
    const error = invalidCall(call)
    expect(error.code).toBe(ErrorCodes.invalidOptions)
    expect(issuesOf(error)).toContainEqual({
      code,
      path,
      message: expect.stringContaining(message),
    })
  })

  it("passes a category in except that partly overlaps what 'only' kept", () => {
    const result = operatorSet(coreOperators, {
      only: ['plus', 'upper'],
      except: { category: 'math' },
    })
    expect(names(result)).toEqual(['upper'])
  })

  it("reports a category in except that misses everything 'only' kept", () => {
    const error = invalidCall(() =>
      operatorSet(coreOperators, { only: ['upper'], except: { category: 'math' } })
    )
    expect(issuesOf(error)).toEqual([
      {
        code: ErrorCodes.invalidOptions,
        path: ['except'],
        message: "no operator in category 'math' is among the operators 'only' kept",
      },
    ])
  })

  it('reports a mistyped selector alone, with nothing that follows from it', () => {
    const error = invalidCall(() =>
      operatorSet(coreOperators, { only: 'uper', except: 'plus', replace: myUpper })
    )
    expect(issuesOf(error)).toEqual([
      {
        code: ErrorCodes.unknownOperator,
        path: ['only'],
        message: "'uper' names no operator in the input — did you mean 'upper'?",
      },
    ])
  })

  it('names an unknown category, suggesting the nearest', () => {
    const error = invalidCall(() =>
      operatorSet(coreOperators, { only: { category: 'maths' as OperatorCategory } })
    )
    expect(error.issues).toEqual([
      expect.objectContaining({
        code: ErrorCodes.invalidOptions,
        path: ['only', 'category'],
        message: "'maths' is not a category — did you mean 'math'?",
        suggestion: 'math',
      }),
    ])
  })

  it('suggests the canonical name for an alias, and the nearest for a typo', () => {
    const error = invalidCall(() => operatorSet(coreOperators, { except: ['+', 'uper'] }))
    expect(error.issues?.map(({ suggestion }) => suggestion)).toEqual(['plus', 'upper'])
  })

  it('collects every problem into one throw', () => {
    const error = invalidCall(() =>
      operatorSet(coreOperators, {
        only: [{ category: 'maths' as OperatorCategory }, 'uper'],
        except: '+',
        replace: myNewOperator,
        exclude: 'regex',
      } as never)
    )
    expect(error.issues).toHaveLength(5)
    expect(error.message).toMatch(/\(\+ 4 more issues\)$/)
  })

  it('throws a malformed call with its one issue', () => {
    const error = invalidCall(() =>
      (operatorSet as (...args: unknown[]) => unknown)(myUpper, { exclude: 'x' }, myUpper)
    )
    expect(issuesOf(error)).toEqual([
      {
        code: ErrorCodes.invalidOptions,
        path: [2],
        message: 'the last argument must be the options object',
      },
    ])
  })
})

describe('operatorSet — types', () => {
  it('requires the options object and a known category', () => {
    // Type-level only: each call below is a compile error
    const typeOnly = () => {
      // @ts-expect-error — the options object is required
      operatorSet(coreOperators)
      // @ts-expect-error — a definition is not the options object
      operatorSet(coreOperators, myUpper)
      // @ts-expect-error — categories are checked against OperatorCategory
      operatorSet(coreOperators, { only: { category: 'maths' } })
    }
    expect(typeOnly).toBeInstanceOf(Function)
  })
})
