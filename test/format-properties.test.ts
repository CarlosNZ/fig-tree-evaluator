/**
 * Phase 16 — the format conversions' properties ("Testing" in
 * docs-dev/v3-specs/v3-format.md), the one place anything here compiles.
 * The compiler is the oracle: a conversion changes an expression's form and
 * nothing else, so the input and its conversion compile to the same thing
 * once source paths and walk order are set aside (test/helpers/
 * compiledShape.ts). Run over the curated corpus and over every converted
 * expression in the differential's corpus.
 */
import { FetchClient, isFigTreeError, type SqlConnection } from '../src'
import { compileExpression } from '../src/compile'
import { toCanonical, toShorthand } from '../src/format'
import { buildRegistry, type OperatorRegistry } from '../src/registry'
import { isPlainDataObject } from '../src/utils'
import { migrateV2Expression } from '../src/migrate'
import { converterOptions, type Case } from '../differential/case'
import { corpus } from '../differential/corpus'
import { mockFetch } from '../differential/mocks/fetch'
import { toV3Options, type V3Io } from '../differential/v3Options'
import { corpusFig, corpusRegistry, formatCorpus } from './fixtures/formatCorpus'
import { compiledShape } from './helpers/compiledShape'
import { deepFreeze } from './helpers/migration'

const off = { getAsReference: false }

/**
 * The round trip's one known exception ("Testing" in the spec): a call with
 * no `parameters` comes back from shorthand with an empty map, which
 * compiles the same. Supplying the map everywhere puts both sides alike.
 */
const withCallMaps = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withCallMaps)
  if (!isPlainDataObject(value)) return value
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, withCallMaps(child)])
  )
  if (typeof value.fragment === 'string' && !('parameters' in value)) normalized.parameters = {}
  return normalized
}

describe('the curated corpus', () => {
  test.each(formatCorpus)('%s compiles without errors', (_label, expression) => {
    const { issues } = compileExpression(expression, corpusRegistry)
    expect(issues.filter(({ issue }) => issue.severity === 'error')).toEqual([])
  })

  describe('toCanonical', () => {
    test.each(formatCorpus)('%s compiles as its input does', (_label, expression) => {
      const converted = toCanonical(deepFreeze(expression), corpusFig)
      expect(compiledShape(converted, corpusRegistry)).toEqual(
        compiledShape(expression, corpusRegistry)
      )
    })

    test.each(formatCorpus)('%s is idempotent', (_label, expression) => {
      const once = toCanonical(expression, corpusFig)
      expect(toCanonical(once, corpusFig)).toEqual(once)
    })

    test.each(formatCorpus)('%s compiles as its input does, respelled', (_label, expression) => {
      for (const names of ['canonical', 'alias'] as const) {
        const converted = toCanonical(expression, corpusFig, {
          operatorNames: names,
          referenceNames: names,
        })
        expect(compiledShape(converted, corpusRegistry, { ignoreSpelling: true })).toEqual(
          compiledShape(expression, corpusRegistry, { ignoreSpelling: true })
        )
      }
    })
  })

  describe('toShorthand', () => {
    test.each(formatCorpus)('%s compiles as its input does', (_label, expression) => {
      const converted = toShorthand(deepFreeze(expression), corpusFig, off)
      expect(compiledShape(converted, corpusRegistry)).toEqual(
        compiledShape(expression, corpusRegistry)
      )
    })

    test.each(formatCorpus)('%s is idempotent', (_label, expression) => {
      for (const options of [off, {}, { arguments: 'named' as const }]) {
        const once = toShorthand(expression, corpusFig, options)
        expect(toShorthand(once, corpusFig, options)).toEqual(once)
      }
    })

    test.each(formatCorpus)('%s round-trips through canonical form', (_label, expression) => {
      const there = toShorthand(expression, corpusFig, off)
      expect(withCallMaps(toCanonical(there, corpusFig))).toEqual(
        withCallMaps(toCanonical(expression, corpusFig))
      )
    })

    test.each(formatCorpus)(
      '%s compiles as its input does, named and respelled',
      (_label, expression) => {
        for (const names of ['canonical', 'alias'] as const) {
          const converted = toShorthand(expression, corpusFig, {
            ...off,
            arguments: 'named',
            operatorNames: names,
            referenceNames: names,
          })
          expect(compiledShape(converted, corpusRegistry, { ignoreSpelling: true })).toEqual(
            compiledShape(expression, corpusRegistry, { ignoreSpelling: true })
          )
        }
      }
    )
  })
})

describe("the differential's converted corpus", () => {
  const noDatabase = { query: () => Promise.reject(new Error('no database here')) }
  const io: V3Io = { http: new FetchClient(mockFetch), postgres: noDatabase as SqlConnection }

  // One registry per options object, as the differential's runner builds
  // one evaluator per options object
  const registries = new Map<unknown, { registry: OperatorRegistry }>()
  const setupFor = (entry: Case) => {
    let built = registries.get(entry.options)
    if (built === undefined) {
      const { options } = toV3Options(entry, io)
      const registry = buildRegistry({
        operators: options.operators ?? [],
        ...(options.fragments ? { fragments: options.fragments } : {}),
        ...(options.operatorDefaults ? { operatorDefaults: options.operatorDefaults } : {}),
      })
      built = { registry }
      registries.set(entry.options, built)
    }
    return built
  }
  // A Registry over the built registry's own names, as a snapshot-holding
  // editor would pass one
  const figFor = (registry: OperatorRegistry) => ({
    getOperators: () => [...registry.operators.values()].map(({ definition }) => definition),
    getFragments: () => [...registry.fragments.keys()].map((name) => ({ name })),
  })

  test.each(corpus.map((entry) => [entry.id, entry] as const))(
    '#%i: both conversions compile as the conversion does, and round-trip',
    (_id, entry) => {
      const { registry } = setupFor(entry)
      const { expression } = migrateV2Expression(entry.expression, converterOptions(entry))
      let converted: unknown
      try {
        converted = toCanonical(expression, figFor(registry))
      } catch (error) {
        // A node the compiler can't read either: the compiler reports the
        // same code as an error
        if (!isFigTreeError(error)) throw error
        const codes = compileExpression(expression, registry)
          .issues.filter(({ issue }) => issue.severity === 'error')
          .map(({ issue }) => issue.code)
        expect(codes).toContain(error.code)
        return
      }
      expect(compiledShape(converted, registry)).toEqual(compiledShape(expression, registry))
      expect(toCanonical(converted, figFor(registry))).toEqual(converted)

      const short = toShorthand(expression, figFor(registry), off)
      expect(compiledShape(short, registry)).toEqual(compiledShape(expression, registry))
      expect(toShorthand(short, figFor(registry), off)).toEqual(short)
      expect(withCallMaps(toCanonical(short, figFor(registry)))).toEqual(withCallMaps(converted))
    }
  )

  // The converter promises canonical v3 throughout, with one exception: a
  // call on a converted v2 custom function is written positionally, since
  // only the host knows its parameter names ("Batch 5" in
  // docs-dev/v3-specs/v3-converter.md). Cases registering functions are
  // left out for that reason
  test.each(
    corpus.filter((entry) => !entry.options?.functions).map((entry) => [entry.id, entry] as const)
  )('#%i: the conversion is already canonical', (_id, entry) => {
    const { registry } = setupFor(entry)
    const { expression } = migrateV2Expression(entry.expression, converterOptions(entry))
    let converted: unknown
    try {
      converted = toCanonical(expression, figFor(registry), {
        operatorNames: 'canonical',
        referenceNames: 'canonical',
      })
    } catch (error) {
      if (isFigTreeError(error)) return // covered above
      throw error
    }
    expect(converted).toEqual(expression)
  })
})
