/**
 * `fallbackCoverage` under a timeout: timeout shielding (fallback rule 3 in
 * "fallback semantics", docs-dev/v3-specs/v3-api.md) reported hole by hole.
 * Worked example 3 in docs-dev/v3-specs/v3-worked-examples.md is the
 * acceptance test; what shielding promises at runtime is asserted in
 * test/evaluate-timeout.test.ts.
 *
 * Each top-level value without a constant fallback is an uncovered
 * `timeout` finding at its path. The findings without a timeout are
 * reported beside them, and are asserted in test/authoring.test.ts.
 */
import { FigTree } from '../src'
import type { CoverageFinding } from '../src'
import { fallbackCoverage } from '../src/authoring'
import { compileOps } from './fixtures/compileRegistry'

const fig = new FigTree({ operators: [compileOps()] })

const timeouts = (findings: CoverageFinding[]) =>
  findings.filter((finding) => finding.code === 'timeout').map((finding) => finding.path)

const underTimeout = async (expression: unknown, instance: FigTree = fig) =>
  timeouts((await fallbackCoverage(instance, expression, { timeout: 50 })).uncovered)

test('worked example 3: one dynamic fallback leaves its hole uncovered', async () => {
  const banner = {
    greeting: { $format: ['Hi %1', '$data.name'], fallback: 'Hi there' },
    offers: { operator: 'http', url: 'https://api.example.com/offers', fallback: [] },
  }
  expect(await underTimeout(banner)).toEqual([])

  const banner2 = {
    ...banner,
    offers: { ...banner.offers, fallback: '$data.cachedOffers' },
  }
  expect(await underTimeout(banner2)).toEqual([['offers']])
})

test('every hole root needs a constant fallback, and each that lacks one is listed', async () => {
  const partial = {
    a: { $http: 'https://x.test', fallback: [] },
    b: { $plus: ['$data.x', 1] },
  }
  expect(await underTimeout(partial)).toEqual([['b']])
})

test('a node root is covered by its own constant fallback', async () => {
  expect(await underTimeout({ $http: 'https://x.test', fallback: null })).toEqual([])
  expect(await underTimeout({ $http: 'https://x.test' })).toEqual([[]])
})

test('an operatorDefaults fallback counts when it is constant', async () => {
  const shieldedByDefaults = new FigTree({
    operators: [compileOps()],
    operatorDefaults: { http: { fallback: 'offline' } },
  })
  expect(await underTimeout({ a: { $http: 'https://x.test' } }, shieldedByDefaults)).toEqual([])
  // The same expression on the plain instance is uncovered
  expect(await underTimeout({ a: { $http: 'https://x.test' } })).toEqual([['a']])
})

test('a vars block on a plain-literal root does not uncover its holes', async () => {
  // Phase-5 correction: the root skeleton was treated as a single hole when
  // it carried vars, and a skeleton has no fallback of its own — so an
  // expression whose every hole was shielded reported unshielded
  const shared = {
    vars: { base: 'https://api.example.com' },
    offers: { $http: { url: '$vars.base' }, fallback: [] },
    banner: { $http: { url: '$vars.base' }, fallback: 'none' },
  }
  expect(await underTimeout(shared)).toEqual([])

  const partial = { ...shared, banner: { $http: { url: '$vars.base' } } }
  expect(await underTimeout(partial)).toEqual([['banner']])
})

test('the instance timeout applies with no timeout passed', async () => {
  const timed = new FigTree({ operators: [compileOps()], timeout: 50 })
  const expression = { a: { $http: 'https://x.test', fallback: '$data.cached' } }
  expect(timeouts((await fallbackCoverage(timed, expression)).uncovered)).toEqual([['a']])
  // Without any timeout, a dynamic fallback that cannot throw covers it
  expect((await fallbackCoverage(fig, expression)).uncovered).toEqual([])
})

test('a reference hole is never shielded, so a timeout lists it', async () => {
  expect(
    await underTimeout({ a: '$data.x', b: { $http: 'https://x.test', fallback: null } })
  ).toEqual([['a']])
})

test("a call lifts its body root's constant fallback", async () => {
  const withFragment = new FigTree({
    fragments: { safe: { expression: { $upper: '$data.s', fallback: 'k' } } },
  })
  const all = async (expression: unknown) =>
    (await fallbackCoverage(withFragment, expression, { timeout: 50 })).uncovered.map((finding) => [
      finding.path,
      finding.code,
    ])
  expect(await all({ a: { $safe: {} } })).toEqual([])
  // Shielded all the same, but its arguments are evaluated and checked
  // before the body runs, outside the body's fallbacks
  expect(await all({ a: { fragment: 'safe', parameters: '$data.args' } })).toEqual([
    [['a', 'parameters'], 'type-check'],
  ])
})

test('a timeout finding sits beside the findings without one', async () => {
  const { uncovered } = await fallbackCoverage(
    fig,
    { b: { $plus: ['$data.x', 1] } },
    { timeout: 50 }
  )
  expect(uncovered).toEqual([
    expect.objectContaining({ path: ['b'], code: 'operator-failure' }),
    {
      path: ['b'],
      code: 'timeout',
      message: expect.stringContaining('constant fallback'),
      certainty: 'may',
    },
  ])
})
