import { FigTree, OperatorFailure, coreOperators, defineOperator, httpOperators, sqlOperators } from '..'
import type { HttpClient, SqlConnection } from '..'
import { fallbackCoverage } from '../authoring'
import { fragments, sections } from '../../test/coverage-cases'
import type { CoverageCase, Finding } from '../../test/coverage-cases'

const client: HttpClient = { request: async () => ({ n: 1 }) }
const connection: SqlConnection = { query: async () => [{ a: 1 }] }
const io = [coreOperators, httpOperators(client), sqlOperators(connection)]
const ioDefaults = { http: { noCache: true as const }, graphQL: { noCache: true as const }, sql: { noCache: true as const } }
const twice = defineOperator({ name: 'twice', category: 'math', description: 'x', parameters: { value: { type: 'number' } }, positionalParams: ['value'], returns: 'number', evaluate: ({ value }) => value * 2 })
const shaky = defineOperator({ name: 'shaky', category: 'string', description: 'x', parameters: { value: { type: 'string' } }, positionalParams: ['value'], returns: 'string', evaluate: ({ value }) => { if (value === '') throw new OperatorFailure('x'); return value } })
const picky = defineOperator({ name: 'picky', category: 'string', description: 'x', parameters: { value: { type: 'string' } }, positionalParams: ['value'], returns: 'string', coverage: { failures: [{ code: 'operator-failure', parameter: 'value', when: { value: '' } }] }, evaluate: ({ value }) => value })
const instances: Record<string, FigTree> = {
  default: new FigTree(), strict: new FigTree({ strictDataPaths: true }), fragments: new FigTree({ fragments }),
  lowerDefault: new FigTree({ operatorDefaults: { lower: { fallback: '' } } }),
  io: new FigTree({ operators: io, operatorDefaults: ioDefaults }),
  ioBase: new FigTree({ operators: io, operatorDefaults: ioDefaults, http: { baseEndpoint: 'https://api.test' } }),
  host: new FigTree({ operators: [coreOperators, [twice, shaky, picky]] }),
}
const show = (f: any) => {
  const corpus = 'at' in f
  return `${JSON.stringify(corpus ? f.at : f.path)} ${f.code}${f.parameter ? ` [${f.parameter}]` : ''} ${corpus ? (f.will ? 'always' : 'may') : f.certainty}${(corpus ? f.by : f.coveredBy) ? ` by ${JSON.stringify(corpus ? f.by : f.coveredBy)}` : ''}${f.fragmentPath ? ` fp ${JSON.stringify(f.fragmentPath)}` : ''}`
}
const key = (f: any, p: boolean) => { const c = 'at' in f; return JSON.stringify([c ? f.at : f.path, f.code, c ? (f.will ? 'always' : 'may') : f.certainty, p ? f.parameter : undefined, f.fragment, f.fragmentPath, c ? f.by : f.coveredBy, c ? f.byFragmentPath : f.coveredByFragmentPath]) }
const same = (exp: Finding[], act: any[]) => { if (exp.length !== act.length) return false; const pool = [...act]; return exp.every((f) => { const p = f.parameter !== undefined; const i = pool.findIndex((c) => key(c, p) === key(f, p)); if (i < 0) return false; pool.splice(i, 1); return true }) }
let n = 0, total = 0
const only = process.argv[2]
for (const [section, cases] of Object.entries(sections)) for (const item of cases as CoverageCase[]) {
  total++
  const a = fallbackCoverage(instances[item.instance ?? 'default'], item.expression, item.options)
  const ok = same(item.uncovered ?? [], a.uncovered) && same(item.covered ?? [], a.covered)
  if (ok) { n++; if (only !== 'all') continue }
  console.log(`\n${ok ? '✓' : '✗'} [${section}] ${item.name}\n  ${JSON.stringify(item.expression)}`)
  console.log('  expected uncovered:', (item.uncovered ?? []).map(show)); console.log('  actual   uncovered:', a.uncovered.map(show))
  console.log('  expected covered:', (item.covered ?? []).map(show)); console.log('  actual   covered:', a.covered.map(show))
}
console.log(`\n${n} of ${total} exact`)
