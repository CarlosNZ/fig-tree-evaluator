/**
 * The rule checker for #217 ("Testing" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): every core operator, run
 * over edge-case values for each of its parameters, at both number levels.
 *
 * - Every failure the engine shows must be predicted: by a parameter's type
 *   check (`resolveInputs`), or by one of the operator's failure rules that
 *   does not answer no.
 * - Every rule must answer yes, or maybe for a `may` rule, at least once
 *   where the engine really fails with its code: no rule that never fires.
 *
 * This is what keeps the core table complete. Each parameter reads its
 * value from the data, so one compiled node serves every combination.
 */
import { FigTree, coreOperators, isFigTreeError } from '../src'
import type { FailureRule, ValidatedOperatorDefinition } from '../src'
import { viewHandle } from '../src/FigTree'
import type { OperatorNode } from '../src/compile/artifact'
import { checkElementResult, resolveInputs } from '../src/authoring/inputs'
import { elementsOf, exactly } from '../src/authoring/known'
import type { Known } from '../src/authoring/known'
import { CORE_RULES, answerRule } from '../src/authoring/rules'
import type { ExpectedType } from '../src/typeCheck'

const MISSING = Symbol('missing')

const NUMBERS = [0, 1, -1, 2, 0.5, -2.5, 3, 10, 100, 1000, -400, 400]
const EXTREME = [1e308, -1e308, 1e-10, 5e-324, NaN, Infinity, -Infinity]
const STRINGS = ['', 'a', 'abc', 'A', ' a ', '42', '-1.5', ' 7 ', 'Infinity', '1e999', 'a[', 'g']
const MORE_STRINGS = ['u', 'gi', 'gg', 'x', '\\-', 'a.b', 'a[0]', '0x1F', 'number', 'string']
const ARRAYS = [
  [],
  [1],
  [1, 2],
  [0, 1],
  ['a'],
  ['a', 'b'],
  [null],
  [1, null],
  [[1]],
  [{}],
  [{ key: 'a', value: 1 }],
  [1, 'a'],
]
const OBJECTS = [{}, { a: 1 }, { a: null }, { b: 'x' }]
/**
 * A few values of every kind, for an `any` parameter and to stray outside a
 * type
 */
const MIXED = [0, 1, 'a', '', true, null, [], [1], {}, { a: 1 }, 'Infinity', ' 7 ']

const poolOf = (type: ExpectedType, strict: boolean): unknown[] => {
  if (typeof type === 'object' && 'literal' in type) return [...type.literal, 'other', null]
  const basics = typeof type === 'string' ? [type] : type
  const pool: unknown[] = []
  for (const basic of basics)
    switch (basic) {
      case 'number':
        pool.push(...NUMBERS, ...(strict ? EXTREME : []))
        break
      case 'integer':
        pool.push(...NUMBERS.filter(Number.isInteger), ...(strict ? [1e308, -1e308] : []))
        break
      case 'string':
        pool.push(...STRINGS, ...MORE_STRINGS)
        break
      case 'boolean':
        pool.push(true, false)
        break
      case 'array':
        pool.push(...ARRAYS)
        break
      case 'object':
        pool.push(...OBJECTS)
        break
      case 'null':
        pool.push(null)
        break
      case 'any':
        pool.push(...MIXED, ...(strict ? [NaN, 1e308] : []))
        break
    }
  return [...new Set([...pool, ...MIXED.slice(0, 6)])]
}

const LEVELS = [
  { numbers: 'ordinary' as const, fig: new FigTree(), evaluation: {} },
  {
    numbers: 'strict' as const,
    fig: new FigTree({ strictDataPaths: true }),
    evaluation: { strictDataPaths: true },
  },
]
const SAMPLES = 1500

interface Report {
  unpredicted: string[]
  fired: Set<number>
}

/** One operator at one level: each combination run and predicted. */
const check = async (
  definition: ValidatedOperatorDefinition,
  level: (typeof LEVELS)[number],
  report: Report
) => {
  const rules: FailureRule[] = CORE_RULES[definition.name] ?? []
  const names = Object.entries(definition.parameters)
    .filter(([, declared]) => declared.evaluation !== 'structural')
    .map(([name]) => name)
  const pools = names.map((name) => {
    const declared = definition.parameters[name]
    const pool = poolOf(declared.type, level.numbers === 'strict')
    return declared.required ? pool : [MISSING, ...pool]
  })
  const total = pools.reduce((product, pool) => product * pool.length, 1)
  let seed = 11
  const next = () => (seed = (seed * 48271) % 2147483647)
  const nodes = new Map<string, OperatorNode>()

  for (let i = 0; i < Math.min(total, SAMPLES); i++) {
    let index = total <= SAMPLES ? i : next() % total
    const values: Record<string, unknown> = {}
    for (const [p, pool] of pools.entries()) {
      const value = pool[index % pool.length]
      index = Math.floor(index / pool.length)
      if (value !== MISSING) values[names[p]] = value
    }
    const present = Object.keys(values)
    const expression = {
      operator: definition.name,
      ...Object.fromEntries(present.map((name) => [name, `$data.${name}`])),
    }
    const shape = present.join(',')
    let node = nodes.get(shape)
    if (node === undefined) {
      const handle = level.fig.compile(expression)
      if (handle.hasErrors) continue
      node = viewHandle(handle)!.artifact.root as OperatorNode
      nodes.set(shape, node)
    }

    // What the analysis predicts of these exact values
    const outputs: Record<string, Known> = {}
    for (const name of present) outputs[name] = exactly(values[name])
    const inputs = resolveInputs(node, outputs)
    const predicted = new Set(inputs.failures.map((failure) => failure.code))
    for (const [name, declared] of definition.resolution.perElement)
      if (Object.hasOwn(values, name) && declared.over !== undefined) {
        if (elementsOf(inputs.received[declared.over] ?? []).length === 0) continue
        const failure = checkElementResult(node, name, declared, outputs[name])
        if (failure !== undefined) predicted.add(failure.code)
      }
    const answers = rules.map((rule) =>
      inputs.propagates === 'yes'
        ? 'no'
        : answerRule(node, rule, inputs, { numbers: level.numbers, evaluation: level.evaluation })
    )
    rules.forEach((rule, r) => answers[r] !== 'no' && predicted.add(rule.code))

    let failed: string | undefined
    try {
      await level.fig.evaluate(expression, { data: values })
    } catch (error) {
      if (!isFigTreeError(error)) throw error
      failed = error.code
    }
    if (failed === undefined) continue
    if (!predicted.has(failed) && report.unpredicted.length < 8)
      report.unpredicted.push(`${failed} with ${JSON.stringify(values, replacer)}`)
    rules.forEach((rule, r) => {
      const fires = answers[r] === 'yes' || (rule.may === true && answers[r] === 'maybe')
      if (fires && rule.code === failed) report.fired.add(r)
    })
  }
}

/** NaN and the infinities, which JSON would show as null. */
const replacer = (_key: string, value: unknown) =>
  typeof value === 'number' && !Number.isFinite(value) ? String(value) : value

describe('the core failure rules', () => {
  test.each(coreOperators.map((definition) => [definition.name, definition] as const))(
    '%s',
    async (_name, definition) => {
      const report: Report = { unpredicted: [], fired: new Set() }
      for (const level of LEVELS) await check(definition, level, report)
      expect(report.unpredicted).toEqual([])
      const rules = CORE_RULES[definition.name] ?? []
      const dead = rules.filter((_rule, r) => !report.fired.has(r))
      expect(dead).toEqual([])
    }
  )

  test('every rule names an operator the core has', () => {
    const names = new Set(coreOperators.map((definition) => definition.name))
    expect(Object.keys(CORE_RULES).filter((name) => !names.has(name))).toEqual([])
  })
})
