/**
 * Phase 10 showcase — `pnpm dev phase10_showcase`. The kill switch and
 * timeout shielding: a whole-evaluation deadline that cuts through every
 * fallback, the one static exception that lets a timed-out expression
 * return instead of throw, and the caller's signal, which nothing shapes.
 * Every phase closes with one of these (implementation-plan working rule
 * 7).
 *
 * Runs offline. The client is a stub with one slow route that never
 * answers and ignores its signal — a driver that cannot be interrupted,
 * which is exactly the case the deadline exists for.
 */
import { FigTree, coreOperators, httpOperators } from '../index'
import type { HttpClient } from '../index'
import { block, outcome, print, section } from './showcase'

const client: HttpClient = {
  request: async (req) => {
    if (req.url.includes('slow')) return new Promise(() => {})
    if (req.url.includes('offers')) return [{ id: 7, title: 'Free shipping' }]
    return { ok: true }
  },
}

const timed = async (run: () => Promise<unknown>) => {
  const started = Date.now()
  const result = await outcome(run)
  return `${result}   [${Date.now() - started}ms]`
}

const main = async () => {
  const fig = new FigTree({
    operators: [coreOperators, httpOperators(client)],
    http: { baseEndpoint: 'https://api.example.com' },
  })

  section('A deadline over a request that never answers')

  const unshielded = {
    greeting: { $buildString: ['Hi %1', '$data.name'] },
    offers: { $http: '/slow' },
  }
  print(
    'no fallbacks: the timeout throws, and greeting’s finished value goes with it',
    unshielded,
    await timed(() => fig.evaluate(unshielded, { data: { name: 'Ada' }, timeout: 50 }))
  )

  section('The same config, shielded: static fallbacks at every root')

  const banner = {
    greeting: { $buildString: ['Hi %1', '$data.name'], fallback: 'Hi there' },
    offers: { $http: '/slow', fallback: [] },
  }
  console.log(`  validate(): ${block(fig.validate(banner))}\n`)
  print(
    'greeting finished → its real value; offers did not → its static fallback',
    banner,
    await timed(() => fig.evaluate(banner, { data: { name: 'Ada' }, timeout: 50 }))
  )
  const quick = { ...banner, offers: { $http: '/offers', fallback: [] } }
  print(
    'and with time to answer, the same expression returns the real offers',
    quick,
    await timed(() => fig.evaluate(quick, { data: { name: 'Ada' }, timeout: 500 }))
  )

  section('One dynamic fallback un-shields the whole expression')

  const banner2 = { ...banner, offers: { $http: '/slow', fallback: '$data.cachedOffers' } }
  console.log(`  validate(): ${block(fig.validate(banner2))}\n`)
  print(
    'a fallback that could start new work past the deadline cannot shield it',
    banner2,
    await timed(() =>
      fig.evaluate(banner2, { data: { name: 'Ada', cachedOffers: ['stale'] }, timeout: 50 })
    )
  )

  section('Two kinds of timeout')

  const perRequest = { $http: { url: '/slow', timeout: 30 }, fallback: 'request timed out' }
  print(
    'a node’s own timeout is an ordinary failure — its fallback catches it',
    perRequest,
    await timed(() => fig.evaluate(perRequest, { timeout: 5000 }))
  )
  const budget = { $http: { url: '/slow', timeout: 5000 }, fallback: { $buildString: ['cached'] } }
  print(
    'the evaluation deadline is the kill switch — a dynamic fallback never runs',
    budget,
    await timed(() => fig.evaluate(budget, { timeout: 30 }))
  )

  section('The caller’s signal is never shaped by anything')

  const controller = new AbortController()
  setTimeout(() => controller.abort(), 20)
  print(
    'shielded or not, a cancelled evaluation rejects: nobody is waiting',
    banner,
    await timed(() =>
      fig.evaluate(banner, { data: { name: 'Ada' }, signal: controller.signal, timeout: 5000 })
    )
  )

  section('The deadline holds against a driver that ignores its signal')

  const deaf = { $http: '/slow' }
  print(
    'no per-request timeout, a request that never returns — the call still ends on time',
    deaf,
    await timed(() => fig.evaluate(deaf, { timeout: 40 }))
  )
}

main()
