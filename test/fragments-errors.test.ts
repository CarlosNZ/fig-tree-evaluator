/**
 * Chunk 11.2 — the two-level error pointer and shielding through a call
 * (worked example 4 in docs-dev/v3-specs/v3-worked-examples.md; "The
 * two-level path story" in docs-dev/v3-specs/v3-evaluator-methods.md;
 * artifact obligation B2 as amended).
 *
 * A failure inside a registered body has no single location in the input,
 * so the error carries both ends: `path` says which call failed, and
 * always resolves in the input; `fragment` + `fragmentPath` say where in
 * the definition. A failure in an ARGUMENT is caller-side and carries only
 * the first.
 */
import { FigTree, FigTreeError, ErrorCodes, coreOperators } from '../src'
import { boomOp, sleepOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'
import type { FragmentDefinition, ValidatedOperatorDefinition } from '../src'

const build = (
  fragments: Record<string, FragmentDefinition>,
  operators: ValidatedOperatorDefinition[] = []
) => new FigTree({ operators: [coreOperators, ...operators], fragments })

// ── Which side of the boundary a failure came from ──────────────────

describe('argument failures are caller-side', () => {
  test('a failing argument expression keeps its path in the input', async () => {
    const fig = build({ frag: { expression: '$params.v', parameters: { v: {} } } }, [boomOp()])
    const error = await rejection<FigTreeError>(
      fig.evaluate({ banner: { $frag: { v: { $boom: {} } } } })
    )
    expect(error.path).toEqual(['banner', '$frag', 'v'])
    expect(error.fragment).toBeUndefined()
    expect(error.fragmentPath).toBeUndefined()
  })

  // Where the declaration is strict, the argument check fires at the
  // boundary and the value never enters the body at all — so the failure
  // is the CALL's, with a caller-side path and no fragmentPath. Worked
  // example 4 declares `role` a string and still expects the body's own
  // operator to be the one that rejects; only the looser declaration can
  // produce that shape
  test('a declared type refuses the argument before the body sees it', async () => {
    const strict = build({
      frag: {
        expression: { $join: { values: '$params.roles' } },
        parameters: { roles: { type: 'array' } },
      },
    })
    const error = await rejection<FigTreeError>(
      strict.evaluate({ banner: { $frag: { roles: '$data.n' } } }, { data: { n: 7 } })
    )
    expect(error.message).toContain("fragment 'frag' – parameter 'roles'")
    expect(error.path).toEqual(['banner', '$frag', 'roles'])
    expect(error.fragmentPath).toBeUndefined()
  })
})

// ── Nesting ─────────────────────────────────────────────────────────

describe('nested calls report the innermost body', () => {
  const fig = () =>
    build(
      {
        outer: { expression: { section: { $inner: {} } } },
        inner: { expression: { $boom: {} } },
      },
      [boomOp()]
    )

  test('fragment and fragmentPath name the innermost body', async () => {
    const error = await rejection<FigTreeError>(fig().evaluate({ top: { $outer: {} } }))
    expect(error.fragment).toBe('inner')
    expect(error.fragmentPath).toEqual(['expression'])
    // The intermediate hop — the call to `inner`, sitting inside outer's
    // body — is not in the error; it is trace's job
    expect(error.path).toEqual(['top'])
  })

  test('an argument written inside a body is attributed to that body', async () => {
    const fig = build(
      {
        outer: { expression: { $inner: { v: { $boom: {} } } } },
        inner: { expression: '$params.v', parameters: { v: {} } },
      },
      [boomOp()]
    )
    const error = await rejection<FigTreeError>(fig.evaluate({ top: { $outer: {} } }))
    // The failing expression is outer's, not inner's
    expect(error.fragment).toBe('outer')
    expect(error.fragmentPath).toEqual(['expression', '$inner', 'v'])
    expect(error.path).toEqual(['top'])
  })
})

// ── Shielding lifts through a call ──────────────────────────────────

describe('timeout shielding through a call', () => {
  const cleanups: (() => void)[] = []
  afterEach(() => cleanups.splice(0).forEach((clear) => clear()))

  const slow = () => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    return sleep
  }

  test('a call lifts its body root fallback, so factoring out stays shielded', async () => {
    const sleep = slow()
    const fig = build({ slowFrag: { expression: { $sleep: [300], fallback: 'shielded' } } }, [
      sleep.definition,
    ])
    expect(fig.validate({ a: { $slowFrag: {} } }).timeoutShielded).toBe(true)
    expect(await fig.evaluate({ a: { $slowFrag: {} } }, { timeout: 30 })).toEqual({
      a: 'shielded',
    })
  })

  test('a call-site fallback wins where one is authored', async () => {
    const sleep = slow()
    const fig = build({ slowFrag: { expression: { $sleep: [300], fallback: 'from body' } } }, [
      sleep.definition,
    ])
    expect(
      await fig.evaluate({ a: { $slowFrag: {}, fallback: 'from call' } }, { timeout: 30 })
    ).toEqual({ a: 'from call' })
  })

  // The lift is transitive. A body rooted at another call reads its
  // target's constant through the registry, not through its own artifact:
  // the walk that compiled this body ran before any target was folded
  test('the lift composes through a nested call', async () => {
    const sleep = slow()
    const fig = build(
      {
        slowFrag: { expression: { $sleep: [300], fallback: 'shielded' } },
        wrapper: { expression: { $slowFrag: {} } },
        outer: { expression: { $wrapper: {} } },
      },
      [sleep.definition]
    )
    expect(fig.validate({ a: { $wrapper: {} } }).timeoutShielded).toBe(true)
    expect(fig.validate({ a: { $outer: {} } }).timeoutShielded).toBe(true)
    expect(await fig.evaluate({ a: { $outer: {} } }, { timeout: 30 })).toEqual({
      a: 'shielded',
    })
  })

  // A skeleton-rooted body lifts the shape assembled from every hole's
  // fallback — a call being one hole at its call site, it contributes all
  // of them or none
  test('a skeleton-rooted body lifts its assembled fallbacks', async () => {
    const sleep = slow()
    const fig = build(
      {
        card: {
          expression: {
            title: { $sleep: [300], fallback: 'untitled' },
            body: { $sleep: [300], fallback: '' },
          },
        },
      },
      [sleep.definition]
    )
    expect(fig.validate({ a: { $card: {} } }).timeoutShielded).toBe(true)
    expect(await fig.evaluate({ a: { $card: {} } }, { timeout: 30 })).toEqual({
      a: { title: 'untitled', body: '' },
    })
  })

  test('one unshielded hole leaves the whole skeleton body unlifted', async () => {
    const sleep = slow()
    const fig = build(
      {
        card: {
          expression: {
            title: { $sleep: [300], fallback: 'untitled' },
            body: { $sleep: [300] },
          },
        },
      },
      [sleep.definition]
    )
    expect(fig.validate({ a: { $card: {} } }).timeoutShielded).toBe(false)
    const error = await rejection<FigTreeError>(
      fig.evaluate({ a: { $card: {} } }, { timeout: 30 })
    )
    expect(error.code).toBe(ErrorCodes.timeout)
  })

  test('a body with no static fallback leaves the call unshielded', async () => {
    const sleep = slow()
    const fig = build({ slowFrag: { expression: { $sleep: [300] } } }, [sleep.definition])
    expect(fig.validate({ a: { $slowFrag: {} } }).timeoutShielded).toBe(false)
    const error = await rejection<FigTreeError>(
      fig.evaluate({ a: { $slowFrag: {} } }, { timeout: 30 })
    )
    expect(error.code).toBe(ErrorCodes.timeout)
  })

  // A constant call-site fallback shields, as it does on an operator node.
  // A DYNAMIC one cannot be precomputed, so the expression is unshielded
  // and the kill switch cuts through it — fallback rule 3, unchanged by
  // anything fragments add
  test('a dynamic call-site fallback does not shield, and cannot answer the timeout', async () => {
    const sleep = slow()
    const fig = build({ slowFrag: { expression: { $sleep: [300] } } }, [sleep.definition])
    const expression = { a: { $slowFrag: {}, fallback: { $sleep: [1] } } }
    expect(fig.validate(expression).timeoutShielded).toBe(false)
    const error = await rejection<FigTreeError>(fig.evaluate(expression, { timeout: 30 }))
    expect(error.code).toBe(ErrorCodes.timeout)
  })
})
