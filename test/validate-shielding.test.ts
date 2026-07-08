/**
 * Phase-3.3 black-box suite: the timeoutShielded badge — worked example 3
 * in docs-dev/v3-specs/v3-worked-examples.md is the acceptance test
 * (fallback rule 3 in "fallback semantics", docs-dev/v3-specs/v3-api.md).
 * The badge becomes runtime-true in Phase 10; here it is statically
 * computed and surfaced.
 */
import { FigTree } from '../src'
import { parseOps } from './fixtures/parseRegistry'

const fig = new FigTree({ operators: [parseOps()] })

test('worked example 3: the badge flips when one fallback goes dynamic', () => {
  const banner = {
    greeting: { $format: ['Hi %1', '$data.name'], fallback: 'Hi there' },
    offers: { operator: 'http', url: 'https://api.example.com/offers', fallback: [] },
  }
  expect(fig.validate(banner)).toEqual({ valid: true, issues: [], timeoutShielded: true })

  const banner2 = {
    ...banner,
    offers: { ...banner.offers, fallback: '$data.cachedOffers' },
  }
  expect(fig.validate(banner2)).toEqual({ valid: true, issues: [], timeoutShielded: false })
})

test('shielding is all-or-nothing: every hole root needs a static fallback', () => {
  const partial = {
    a: { $http: 'https://x.test', fallback: [] },
    b: { $plus: ['$data.x', 1] },
  }
  expect(fig.validate(partial).timeoutShielded).toBe(false)
})

test('a node root shields on its own static fallback', () => {
  expect(fig.validate({ $http: 'https://x.test', fallback: null }).timeoutShielded).toBe(true)
  expect(fig.validate({ $http: 'https://x.test' }).timeoutShielded).toBe(false)
})

test('an operatorDefaults modifier fallback counts as a static fallback', () => {
  const shieldedByDefaults = new FigTree({
    operators: [parseOps()],
    operatorDefaults: { http: { fallback: 'offline' } },
  })
  expect(shieldedByDefaults.validate({ a: { $http: 'https://x.test' } }).timeoutShielded).toBe(
    true
  )
  // The same expression on the plain instance is unshielded
  expect(fig.validate({ a: { $http: 'https://x.test' } }).timeoutShielded).toBe(false)
})
