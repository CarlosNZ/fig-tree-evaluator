/**
 * Chunk 12.2 — `evaluate()`'s conditional return type ("The TypeScript
 * story" in docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Compile-time assertions: `pnpm typecheck` covers the test tree, so a
 * return type that stops following the effective options fails CI. The
 * rule under test is one sentence — the bare value, unless `mode` is
 * `'report'` or `trace` is `true` in the MERGED options — and the matrix
 * is what keeps its two independent axes honest.
 *
 * Why there is no `const` type parameter behind any of this: widening
 * applies to a mutable variable declaration, not to inference into a
 * type-parameter position, so a fresh object literal argument keeps
 * `trace: true` as the literal on its own. `const` would additionally
 * infer a readonly tuple for the `operators` array literal, which the
 * declared type does not accept — the last case here is what would
 * catch that.
 */
import { FigTree, coreOperators } from '../src'
import type { EvaluationResult } from '../src'
import { echoOp } from './fixtures/evalOperators'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assertType = <T extends true>(): T | undefined => undefined

// ── Instance-level ──────────────────────────────────────────────────

const plain = new FigTree()
const reporting = new FigTree({ mode: 'report' })
const tracing = new FigTree({ trace: true })
const traceOff = new FigTree({ trace: false })

/*
 * Asserted at CALL sites throughout, never through `ReturnType`: that
 * helper instantiates a generic method's type parameters with their
 * CONSTRAINTS, so `CallOpts` becomes the whole of `FigTreeOptions` and
 * the merge strips the very keys under test. A call is also what a
 * consumer actually writes.
 */
const instanceLevel = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = plain.evaluate({})

  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = reporting.evaluate({})

  assertType<Equal<Awaited<typeof c>, EvaluationResult>>()
  const c = tracing.evaluate({})

  assertType<Equal<Awaited<typeof d>, unknown>>()
  const d = traceOff.evaluate({})

  return [a, b, c, d]
}

// ── Per-call, and per-call overriding the instance both ways ────────

const checks = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = plain.evaluate({})

  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = plain.evaluate({}, { mode: 'report' })

  assertType<Equal<Awaited<typeof c>, EvaluationResult>>()
  const c = plain.evaluate({}, { trace: true })

  assertType<Equal<Awaited<typeof d>, unknown>>()
  const d = plain.evaluate({}, { trace: false })

  assertType<Equal<Awaited<typeof e>, unknown>>()
  const e = plain.evaluate({}, { data: { x: 1 }, timeout: 50 })

  // A per-call throw turns the envelope off again…
  assertType<Equal<Awaited<typeof f>, unknown>>()
  const f = reporting.evaluate({}, { mode: 'throw' })

  // …unless trace is still on at the instance, the two being independent
  assertType<Equal<Awaited<typeof g>, EvaluationResult>>()
  const g = tracing.evaluate({}, { mode: 'throw' })

  assertType<Equal<Awaited<typeof h>, EvaluationResult>>()
  const h = reporting.evaluate({}, { trace: true })

  return [a, b, c, d, e, f, g, h]
}

// ── The cases a `const` type parameter would have broken ────────────

const withRegistry = new FigTree({
  operators: [coreOperators, echoOp()],
  operatorDefaults: { join: { delimiter: ', ' } },
})

const reportingWithRegistry = new FigTree({
  operators: [coreOperators, echoOp()],
  mode: 'report',
})

const registryChecks = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = withRegistry.evaluate({})

  // An array literal beside a diagnostic option: the combination a
  // `const` type parameter would have turned into a readonly tuple
  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = reportingWithRegistry.evaluate({})

  return [a, b]
}

// ── The handle: the instance's options, frozen at compile ───────────

const handleChecks = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = plain.compile({}).evaluate()

  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = reporting.compile({}).evaluate()

  assertType<Equal<Awaited<typeof c>, EvaluationResult>>()
  const c = plain.compile({}).evaluate({ trace: true })

  assertType<Equal<Awaited<typeof d>, unknown>>()
  const d = reporting.compile({}).evaluate({ mode: 'throw' })

  assertType<Equal<Awaited<typeof e>, EvaluationResult>>()
  const e = tracing.compile({}).evaluate({ mode: 'throw' })

  return [a, b, c, d, e]
}

// ── The one documented limitation ───────────────────────────────────

// Options hoisted into a variable widen before the class ever sees them,
// so the instance types as bare-value. `const` would not have reached
// this either — it only applies to literal arguments. The runtime shape
// is still the envelope; it is the static type that cannot follow
const hoisted = { trace: true }
const fromVariable = new FigTree(hoisted)

const limitation = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = fromVariable.evaluate({})
  return a
}

test('the return type follows the effective options', async () => {
  // The runtime half of the same rule, so jest has something to run
  expect(await plain.evaluate({ a: 1 })).toEqual({ a: 1 })
  expect(await reporting.evaluate({ a: 1 })).toEqual({ result: { a: 1 }, errors: [] })
  // The hoisted-options instance still behaves as an envelope at RUNTIME;
  // it is only the static type that cannot follow
  expect(await fromVariable.evaluate({ a: 1 })).toMatchObject({ result: { a: 1 } })
  await Promise.all([instanceLevel(), checks(), registryChecks(), handleChecks(), limitation()])
})
