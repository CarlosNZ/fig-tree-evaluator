/**
 * `validate(body, { params })`: a fragment body checked before it is
 * registered, its `$params` references resolved against the declared names
 * as they are at registration ("validate() — the process" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). For fig-tree-editor-react's
 * fragment editor, which validates a body on each edit.
 */
import { FigTree, FigTreeError, ErrorCodes, coreOperators } from '../src'
import type { CallOptions, Issue, ValidateOptions } from '../src'

const fig = new FigTree({ operators: [coreOperators] })

const errors = (result: { issues: Issue[] }) =>
  result.issues.filter((issue) => issue.severity === 'error')

describe('every form a $params read takes resolves against the declared names', () => {
  const forms: [string, unknown][] = [
    ['$params.x', '$params.x'],
    ['the $p spelling', '$p.x'],
    ['a drill', '$params.x.y'],
    ['bare $params', '$params'],
    ['bare $p', '$p'],
    ['a template token', { $buildString: { template: 'Hi {{$params.x}} and {{$p.y}}' } }],
    ['get from $params with a literal path', { $get: { path: 'x.y', from: '$params' } }],
    ['get from $params with a computed path', { $get: { path: '$data.key', from: '$params' } }],
  ]

  test.each(forms)('%s', (_label, body) => {
    expect(fig.validate(body, { params: ['x', 'y'] })).toEqual({ valid: true, issues: [] })
  })

  test('in vars, fallbacks and iterator bodies alike', () => {
    const body = {
      vars: { a: '$params.x' },
      value: { $plus: ['$vars.a', '$params.y'], fallback: '$params.x' },
      list: { $map: { input: '$params.x', each: { $plus: ['$element', '$params.y'] } } },
    }
    expect(fig.validate(body, { params: ['x', 'y'] }).valid).toBe(true)
  })
})

describe('an undeclared name is an error with the in-body message', () => {
  test('at the reading node', () => {
    const result = fig.validate({ a: '$params.x', b: '$params.z' }, { params: ['x'] })
    expect(errors(result)).toEqual([
      expect.objectContaining({
        code: ErrorCodes.unresolvedParam,
        path: ['b'],
        message: "'$params.z': the fragment declares no parameter 'z'",
      }),
    ])
  })

  test('params: [] declares nothing, so every read gets that message', () => {
    const body = { a: '$params.x', b: { $get: { path: 'y', from: '$p' } } }
    const result = fig.validate(body, { params: [] })
    expect(errors(result).map((issue) => issue.path)).toEqual([['a'], ['b', '$get', 'from']])
    for (const issue of errors(result)) {
      expect(issue.message).toContain('the fragment declares no parameter')
      expect(issue.message).not.toContain('only available inside a fragment body')
    }
  })

  test('bare $params is clean even when nothing is declared', () => {
    expect(fig.validate('$params', { params: [] }).valid).toBe(true)
  })
})

test('without the option, every $params read is the outside-a-body error', () => {
  for (const options of [undefined, {}, { params: undefined }] as (ValidateOptions | undefined)[]) {
    const result = fig.validate({ a: '$params.x', b: '$params' }, options)
    expect(errors(result).map((issue) => issue.message)).toEqual([
      "'$params.x': $params is only available inside a fragment body",
      "'$params': $params is only available inside a fragment body",
    ])
  }
})

test('with data, the sample-data warnings come back at their paths in the body', () => {
  const body = {
    greeting: { $buildString: { template: 'Hi {{$params.name}} from {{$data.site.nmae}}' } },
    found: '$data.site.name',
    nested: { town: '$data.site.twon' },
  }
  const result = fig.validate(body, { params: ['name'], data: { site: { name: 'Pai' } } })
  expect(result.valid).toBe(true)
  expect(
    result.issues
      .filter((issue) => issue.code === ErrorCodes.missingDataPath)
      .map((issue) => issue.path)
  ).toEqual([
    ['greeting', '$buildString', 'template'],
    ['nested', 'town'],
  ])
})

describe('parity with registration', () => {
  // Registration reports a body's errors at
  // ['fragments', name, 'expression', ...], and the declarations are
  // validate()'s `params`
  const register = (expression: unknown, names: string[]): Issue[] => {
    const parameters = Object.fromEntries(names.map((name) => [name, {}]))
    try {
      new FigTree({ operators: [coreOperators], fragments: { draft: { expression, parameters } } })
      return []
    } catch (error) {
      if (!(error instanceof FigTreeError)) throw error
      return error.issues ?? []
    }
  }
  const shape = (issues: Issue[], prefix = 0) =>
    issues.map((issue) => ({ code: issue.code, path: issue.path.slice(prefix) }))

  const bodies: [string, unknown, string[]][] = [
    ['a clean body', { $plus: ['$params.x', '$p.y'], fallback: '$params' }, ['x', 'y']],
    ['an undeclared parameter', { a: '$params.x', b: '$params.z.q' }, ['x']],
    [
      'errors beside the parameter reads',
      { a: '$params.z', b: { operator: 'nope' }, c: '$vars.q', d: { $plus: ['$params.x'] } },
      ['x'],
    ],
    [
      'reads in vars and a fallback',
      {
        vars: { a: '$params.w' },
        value: { $plus: ['$vars.a', '$params.x'], fallback: '$params.missing' },
      },
      ['x'],
    ],
  ]

  test.each(bodies)('%s', (label, body, names) => {
    const registered = register(body, names)
    const validated = errors(fig.validate(body, { params: names }))
    expect(registered.length > 0).toBe(label !== 'a clean body')
    expect(shape(validated)).toEqual(shape(registered, 3))
    expect(registered.every((issue) => issue.path[2] === 'expression')).toBe(true)
  })

  test("and the warnings registration keeps for getFragments() are validate()'s", () => {
    const body = { vars: { unused: 1 }, a: '$flibble', b: '$params.x' }
    const registered = new FigTree({
      operators: [coreOperators],
      fragments: { draft: { expression: body, parameters: { x: {} } } },
    })
    const [{ warnings }] = registered.getFragments()
    const validated = fig.validate(body, { params: ['x'] })
    expect(validated.valid).toBe(true)
    expect(warnings.length).toBeGreaterThan(0)
    expect(shape(validated.issues)).toEqual(shape(warnings, 1))
  })
})

describe('misuse', () => {
  test.each([
    ['a string', 'x'],
    ['a Set', new Set(['x'])],
    ['null', null],
    ['a non-string entry', ['x', 1]],
  ])('params as %s throws invalid-options', (_label, params) => {
    const call = () => fig.validate('$params.x', { params } as unknown as ValidateOptions)
    expect(call).toThrow(FigTreeError)
    expect(call).toThrow(
      expect.objectContaining({
        code: ErrorCodes.invalidOptions,
        message: "'params' must be an array of parameter names (strings)",
      })
    )
  })

  test('the per-call options beside it are still checked', () => {
    expect(() =>
      fig.validate(1, { params: ['x'], maxNodes: 3 } as unknown as ValidateOptions)
    ).toThrow(/not a per-call option/)
  })

  test('evaluate() and compile() refuse params as they refuse any configuration key', async () => {
    // Widened past the signature, as a JS host would reach it
    const options = { params: ['x'] } as unknown as CallOptions
    await expect(fig.evaluate(1, options)).rejects.toMatchObject({
      code: ErrorCodes.invalidOptions,
      message: expect.stringContaining("'params' is not a per-call option"),
    })
    await expect(fig.compile(1).evaluate(options)).rejects.toMatchObject({
      code: ErrorCodes.invalidOptions,
      message: expect.stringContaining("'params' is not a per-call option"),
    })
    // @ts-expect-error — OnlyCallOptions types a key outside CallOptions never
    void fig.evaluate(1, { params: ['x'] }).catch(() => undefined)
  })
})
