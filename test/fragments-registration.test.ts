/**
 * Chunk 11.1 — fragment registration ("Registration-time validation" in the
 * Fragments area of docs-dev/v3-specs/v3-api.md).
 *
 * The posture under test is that registration is the fragment's parse
 * moment: `new FigTree()` throws on a bad fragment rather than deferring to
 * the first call. So most assertions here are on a throw, and the white-box
 * ones read the built registry directly — the `test/registry.test.ts`
 * precedent, since the registry is internal machinery behind the class.
 */
import { FigTree, FigTreeError, ErrorCodes, isFigTreeError, coreOperators } from '../src'
import { buildRegistry } from '../src/registry'
import type { FragmentDefinition } from '../src'

const rejects = (fragments: Record<string, unknown>): FigTreeError => {
  try {
    new FigTree({ fragments: fragments as Record<string, FragmentDefinition> })
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected a registration error')
}

/** The codes of every issue a registration throw collected. */
const codes = (error: FigTreeError): string[] => (error.issues ?? []).map((issue) => issue.code)

const registry = (fragments: Record<string, FragmentDefinition>) =>
  buildRegistry({ operators: [coreOperators], fragments })

// ── The wrapper shape is loud ───────────────────────────────────────

describe('the definition shape', () => {
  test.each([
    ['a bare expression', { $plus: [1, 2] }],
    ['a string', 'hello'],
    ['null', null],
    ['an array', [1, 2]],
  ])('%s is not a wrapper object', (_label, definition) => {
    const error = rejects({ frag: definition })
    expect(codes(error)).toEqual([ErrorCodes.invalidDefinition])
    expect(error.issues?.[0].path).toEqual(['fragments', 'frag'])
  })

  test('a wrapper without an expression is refused', () => {
    expect(codes(rejects({ frag: { parameters: {} } }))).toEqual([ErrorCodes.invalidDefinition])
  })

  test('an unknown wrapper key is refused, not ignored', () => {
    const error = rejects({ frag: { expression: 1, paramaters: {} } })
    expect(codes(error)).toEqual([ErrorCodes.invalidDefinition])
    expect(error.issues?.[0].message).toContain("'paramaters'")
    expect(error.issues?.[0].path).toEqual(['fragments', 'frag', 'paramaters'])
  })

  test('a zero-parameter wrapper is legal — the wrapper is the only rule', () => {
    const fig = new FigTree({ fragments: { frag: { expression: 'hello' } } })
    expect(fig.validate({ $frag: {} }).valid).toBe(true)
  })

  test('description and metadata are carried verbatim', () => {
    const metadata = { backgroundColor: '#B2E0FF', team: 'config-admins' }
    const built = registry({ frag: { expression: 1, description: 'A thing', metadata } })
    const entry = built.fragments.get('frag')
    expect(entry?.description).toBe('A thing')
    expect(entry?.metadata).toEqual(metadata)
  })
})

// ── Names: legality, reservation, one namespace ─────────────────────

describe('registration names', () => {
  test.each([
    ['an empty name', ''],
    ['a $-prefixed name', '$frag'],
    ['a drillable name', 'a.b'],
  ])('%s is illegal', (_label, name) => {
    expect(codes(rejects({ [name]: { expression: 1 } }))).toEqual([ErrorCodes.invalidName])
  })

  test.each(['data', 'literal', 'fallback', 'v'])('%s is reserved', (name) => {
    expect(codes(rejects({ [name]: { expression: 1 } }))).toEqual([ErrorCodes.reservedName])
  })

  test('a fragment may not take an operator name', () => {
    const error = rejects({ plus: { expression: 1 } })
    expect(codes(error)).toEqual([ErrorCodes.duplicateOperator])
    expect(error.message).toContain('one namespace')
  })

  test('a fragment may not take an operator alias', () => {
    expect(codes(rejects({ '+': { expression: 1 } }))).toEqual([ErrorCodes.duplicateOperator])
  })
})

// ── Parameter declarations ──────────────────────────────────────────

describe('parameter declarations', () => {
  const frag = (parameters: Record<string, unknown>) => ({
    frag: { expression: 1, parameters },
  })

  test('an unknown declaration key is refused', () => {
    const error = rejects(frag({ x: { type: 'string', defualt: 'a' } }))
    expect(codes(error)).toEqual([ErrorCodes.invalidDefinition])
    expect(error.issues?.[0].path).toEqual(['fragments', 'frag', 'parameters', 'x', 'defualt'])
  })

  test('a reserved node key may not name a parameter', () => {
    expect(codes(rejects(frag({ fallback: { type: 'string' } })))).toEqual([
      ErrorCodes.reservedName,
    ])
  })

  test('an unknown type is refused', () => {
    expect(codes(rejects(frag({ x: { type: 'strig' } })))).toEqual([ErrorCodes.invalidDefinition])
  })

  test('a type-invalid default is refused', () => {
    const error = rejects(frag({ x: { type: 'string', default: 7 } }))
    expect(codes(error)).toEqual([ErrorCodes.typeCheck])
    expect(error.issues?.[0].message).toContain('expected string, got number')
  })

  test('required and default together is a contradiction', () => {
    const error = rejects(frag({ x: { type: 'string', required: true, default: 'a' } }))
    expect(codes(error)).toEqual([ErrorCodes.invalidDefinition])
    expect(error.issues?.[0].message).toContain('could never apply')
  })

  test('constraints are admitted, and checked against the default', () => {
    expect(
      codes(rejects(frag({ x: { type: 'array', constraints: { length: 2 }, default: [1] } })))
    ).toEqual([ErrorCodes.typeCheck])
    const built = registry(frag({ x: { type: 'array', constraints: { length: 2 } } }) as never)
    expect(built.fragments.get('frag')?.parameters.x.constraints).toEqual({ length: 2 })
  })

  test('a default implies optional; nothing implies required', () => {
    const built = registry(
      frag({
        a: { type: 'string' },
        b: { type: 'string', default: 'x' },
        c: { required: false },
      }) as never
    )
    const { parameters } = built.fragments.get('frag')!
    expect(parameters.a.required).toBe(true)
    expect(parameters.b.required).toBe(false)
    expect(parameters.c.required).toBe(false)
    // An undeclared type is `any`, as it is for an operator parameter
    expect(parameters.c.type).toBe('any')
  })
})

// ── Bodies compile here ─────────────────────────────────────────────

describe('body compilation', () => {
  test('an unknown operator in a body fails registration', () => {
    const error = rejects({ frag: { expression: { operator: 'flibble' } } })
    expect(codes(error)).toEqual([ErrorCodes.unknownOperator])
    expect(error.issues?.[0].path).toEqual(['fragments', 'frag', 'expression'])
    expect(error.issues?.[0].message).toContain("fragment 'frag'")
  })

  test('a malformed node in a body fails registration', () => {
    expect(codes(rejects({ frag: { expression: { operator: 'plus', fragment: 'x' } } }))).toEqual([
      ErrorCodes.malformedNode,
    ])
  })

  test('$params naming an undeclared parameter fails registration', () => {
    const error = rejects({
      frag: { expression: '$params.nmae', parameters: { name: { type: 'string' } } },
    })
    expect(codes(error)).toEqual([ErrorCodes.unresolvedParam])
  })

  test('$params resolves against the declarations', () => {
    expect(
      new FigTree({
        fragments: {
          frag: { expression: '$params.name', parameters: { name: { type: 'string' } } },
        },
      })
    ).toBeInstanceOf(FigTree)
  })

  // Sealing, enforced by compiling in isolation rather than by a check: a
  // body has no caller, so a caller's binding has nothing to resolve against
  test('a body referencing an iterator binding it does not own fails to register', () => {
    expect(codes(rejects({ frag: { expression: '$element' } }))).toEqual([
      ErrorCodes.unresolvedBinding,
    ])
  })

  test('a body referencing a caller var fails to register', () => {
    expect(codes(rejects({ frag: { expression: '$vars.fromCaller' } }))).toEqual([
      ErrorCodes.unresolvedVar,
    ])
  })

  test('a body may declare and read its own vars and iterators', () => {
    const fig = new FigTree({
      fragments: {
        frag: {
          expression: {
            vars: {
              doubled: { $map: { input: '$params.rows', each: { $plus: ['$element', 1] } } },
            },
            out: '$vars.doubled',
          },
          parameters: { rows: { type: 'array' } },
        },
      },
    })
    expect(fig.validate({ $frag: { rows: [1] } }).valid).toBe(true)
  })

  test('warnings survive registration on the compiled body', () => {
    const built = registry({
      frag: { expression: { vars: { unused: 1 }, out: '$typo' } },
    })
    const warnings = built.fragments.get('frag')!.warnings
    expect(warnings.map((w) => w.code).sort()).toEqual(
      [ErrorCodes.unreferencedVar, ErrorCodes.unrecognizedIdentifier].sort()
    )
    expect(warnings.every((w) => w.severity === 'warning')).toBe(true)
    // Body-relative, rooted at the definition's own `expression` key
    expect(warnings.some((w) => w.path[0] === 'expression')).toBe(true)
  })
})

// ── Batches, replacement, and the registry as a whole ───────────────

describe('batch semantics', () => {
  const pair = {
    outer: { expression: { $inner: {} } },
    inner: { expression: 'hello' },
  }

  test('a fragment may call one declared later in the same batch', () => {
    expect(new FigTree({ fragments: pair })).toBeInstanceOf(FigTree)
  })

  test('calling a fragment that is not in the batch is an error', () => {
    const error = rejects({ outer: { expression: { fragment: 'inner' } } })
    expect(codes(error)).toEqual([ErrorCodes.unknownFragment])
  })

  // The shorthand face cannot be an unknown-name error without making every
  // `$`-keyed data object one — the ruling the I/O operators forced at Phase
  // 9. So an unregistered name in shorthand position registers, warns, and
  // passes through as data; the canonical face above is the loud one.
  test('an unregistered name in shorthand position warns instead', () => {
    const built = registry({ outer: { expression: { $inner: {} } } })
    expect(built.fragments.get('outer')!.warnings.map((w) => w.code)).toEqual([
      ErrorCodes.unrecognizedIdentifier,
    ])
  })

  test('replacing a fragment re-validates its dependents', () => {
    const fig = new FigTree({ fragments: pair })
    // `inner` loses the parameter `outer` never passed — still fine — but
    // gaining a required one breaks the existing call site
    expect(() =>
      fig.updateOptions({
        fragments: { inner: { expression: '$params.x', parameters: { x: { type: 'string' } } } },
      })
    ).toThrow(/requires 'x'/)
  })

  test('changing the operators array re-validates every body', () => {
    const fig = new FigTree({
      fragments: { frag: { expression: { operator: 'plus', values: [1, 2] } } },
    })
    const withoutPlus = coreOperators.filter((operator) => operator.name !== 'plus')
    expect(() => fig.updateOptions({ operators: [withoutPlus] })).toThrow(/plus/)
  })

  test('a rejected update leaves the instance as it was', () => {
    const fig = new FigTree({ fragments: pair })
    expect(() =>
      fig.updateOptions({ fragments: { broken: { expression: { operator: 'nope' } } } })
    ).toThrow()
    expect(fig.validate({ $outer: {} }).valid).toBe(true)
  })
})

// ── Recursion is banned ─────────────────────────────────────────────

describe('cycles', () => {
  test('a fragment calling itself is a registration error', () => {
    const error = rejects({ loop: { expression: { $loop: {} } } })
    expect(codes(error)).toEqual([ErrorCodes.fragmentCycle])
    expect(error.message).toContain('loop → loop')
  })

  test('guarded recursion is banned too — the ban is structural', () => {
    expect(
      codes(rejects({ loop: { expression: { $if: [false, { $loop: {} }, 'done'] } } }))
    ).toEqual([ErrorCodes.fragmentCycle])
  })

  test('mutual recursion is caught', () => {
    expect(
      codes(rejects({ a: { expression: { $b: {} } }, b: { expression: { $a: {} } } }))
    ).toEqual([ErrorCodes.fragmentCycle])
  })

  test('a transitive cycle is caught, and reported once', () => {
    const error = rejects({
      a: { expression: { $b: {} } },
      b: { expression: { $c: {} } },
      c: { expression: { $a: {} } },
    })
    expect(codes(error)).toEqual([ErrorCodes.fragmentCycle])
  })

  test('a diamond is not a cycle', () => {
    expect(
      new FigTree({
        fragments: {
          top: { expression: { $plus: [{ $left: {} }, { $right: {} }] } },
          left: { expression: { $leaf: {} } },
          right: { expression: { $leaf: {} } },
          leaf: { expression: 'x' },
        },
      })
    ).toBeInstanceOf(FigTree)
  })
})

// ── The rollups a call site needs ───────────────────────────────────

describe('rollups compose through calls', () => {
  const built = () =>
    registry({
      // The canonical face throughout, so the counts are the plain ones: no
      // positional payload, no synthetic rest-slice container
      leaf: { expression: { operator: 'plus', values: ['$data.a', '$data.b'] } },
      mid: { expression: { operator: 'plus', values: [{ fragment: 'leaf' }, 1] } },
      direct: { expression: { fragment: 'leaf' } },
      two: {
        expression: { operator: 'plus', values: [{ fragment: 'leaf' }, { fragment: 'leaf' }] },
      },
    })

  test('nodeCount is a total: a call adds its target, twice for two calls', () => {
    const { fragments } = built()
    // The plus node and its two references
    expect(fragments.get('leaf')!.nodeCount).toBe(3)
    // Its own plus and call node, plus the whole of leaf
    expect(fragments.get('mid')!.nodeCount).toBe(2 + 3)
    // Two call sites are two evaluations of the body, so leaf counts twice
    expect(fragments.get('two')!.nodeCount).toBe(3 + 3 + 3)
  })

  test('the total reaches the calling expression, where maxNodes reads it', () => {
    const withLimit = (maxNodes: number) =>
      new FigTree({
        fragments: { leaf: { expression: { operator: 'plus', values: ['$data.a', '$data.b'] } } },
        maxNodes,
      })
    // One call node plus the three the body holds
    expect(withLimit(4).validate({ fragment: 'leaf' }).valid).toBe(true)
    expect(withLimit(3).validate({ fragment: 'leaf' }).issues[0].code).toBe(
      ErrorCodes.maxNodesExceeded
    )
  })

  test('maxDepth is a maximum: a call offsets rather than adds', () => {
    const { fragments } = built()
    // Root at 0, the values array at 1, each operand at 2
    expect(fragments.get('leaf')!.maxDepth).toBe(2)
    // A call at the root offsets by nothing — a body measured from its own
    // root at 0 is what makes that exact
    expect(fragments.get('direct')!.maxDepth).toBe(2)
    // A call sitting 2 deep carries leaf's own 2 with it. A total would
    // have said 4 + 2 here
    expect(fragments.get('mid')!.maxDepth).toBe(2 + 2)
  })

  test('dependencies are transitive, so the sample-data check sees body reads', () => {
    const fig = new FigTree({
      fragments: { leaf: { expression: '$data.deep.value' } },
    })
    const issues = fig.validate({ $leaf: {} }, { data: { other: 1 } }).issues
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe(ErrorCodes.missingDataPath)
    expect(issues[0].message).toContain('deep.value')
    expect(fig.validate({ $leaf: {} }, { data: { deep: { value: 1 } } }).issues).toEqual([])
  })

  test('a dynamic-arguments call makes the read-set unenumerable', () => {
    const { fragments } = buildRegistry({
      operators: [],
      fragments: {
        leaf: { expression: '$params.x', parameters: { x: { type: 'any' } } },
        caller: { expression: { fragment: 'leaf', parameters: '$data.args' } },
      },
    })
    expect(fragments.get('caller')!.dependencies.dynamic).toBe(true)
  })
})
