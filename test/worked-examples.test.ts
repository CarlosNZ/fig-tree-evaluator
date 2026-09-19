/**
 * Worked example 1, as far as Phase 7 can carry it
 * (docs-dev/v3-specs/v3-worked-examples.md § 1).
 *
 * The example is a `mode: 'report'` demonstration over five holes, two of
 * which are `http` nodes — so what lands at the core-complete milestone is
 * the throw-mode VALUE half over the three holes that need neither report
 * mode nor a client: success via the null gradient, plain success, and a
 * deep uncaught failure. The full report-mode shape, with `errors` in tree
 * order and both `holePath`s, is Phase 12.1's acceptance test.
 *
 * Only the behaviours are asserted, never the encodings — the doc's own
 * reading rule.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()

const dashboard = {
  meta: { generated: 'v3-example', version: 3 },
  user: {
    displayName: { $buildString: ['%1 %2', '$data.user.first', '$data.user.last'] },
  },
  stats: {
    total: { $plus: ['$data.stats.wins', '$data.stats.losses'] },
    summary: {
      $buildString: ['Win ratio: %1', { $divide: ['$data.stats.wins', '$data.stats.losses'] }],
    },
  },
}

const data = { user: { first: 'Ada', id: 42 }, stats: { wins: 10, losses: 0 } }

test('the healthy holes, and the constant shell that is not a hole', async () => {
  const healthy = { ...dashboard, stats: { total: dashboard.stats.total } }

  expect(await fig.evaluate(healthy, { data })).toEqual({
    meta: { generated: 'v3-example', version: 3 },
    // `user.last` is missing -> null -> buildString renders '' -> a
    // trailing space. Success via the null gradient: no error, no
    // fallback involvement, because absence is not failure
    user: { displayName: 'Ada ' },
    stats: { total: 10 },
  })
})

test("the gradient's opt-outs close the trailing space, and fallback is not one of them", async () => {
  const nameOf = (extra: Record<string, unknown>) =>
    fig.evaluate(
      {
        $buildString: {
          template: '%1 %2',
          substitutions: ['$data.user.first', '$data.user.last'],
          ...extra,
        },
      },
      { data }
    )
  expect(await nameOf({})).toBe('Ada ')
  expect(await nameOf({ closeGaps: true })).toBe('Ada')
  expect(await nameOf({ nullValueDefault: '(unknown)' })).toBe('Ada (unknown)')
})

test('the deep uncaught failure escapes its hole, and throw mode rejects', async () => {
  const error = await rejection<FigTreeError>(fig.evaluate(dashboard, { data }))
  // 10 / 0 is stopped by the finite-number guard, two levels below the
  // hole root, with no fallback anywhere between
  expect(error.code).toBe('non-finite-result')
  expect(error.path).toEqual(['stats', 'summary', '$buildString', 1])
})

test('the sibling hole inside the same literal is independent — stats is plain structure', async () => {
  expect(
    await fig.evaluate(
      {
        ...dashboard,
        stats: { ...dashboard.stats, summary: { ...dashboard.stats.summary, fallback: null } },
      },
      { data }
    )
  ).toEqual({
    meta: { generated: 'v3-example', version: 3 },
    user: { displayName: 'Ada ' },
    stats: { total: 10, summary: null },
  })
})
