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
 * - Every value the engine returns must be admitted by the output the
 *   analysis gives the node: its output declaration, or its `returns`, past
 *   the result boundary.
 * - Every run of the node (rule 4, src/authoring/run.ts), with each
 *   parameter known exactly, must end as the engine's evaluation does: the
 *   same value, or a certain failure with the same code. Every operator
 *   must be run at least once.
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
import { operatorOutput } from '../src/authoring/outputs'
import { runNode } from '../src/authoring/run'
import type { Child } from '../src/authoring/run'
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
  unadmitted: string[]
  fired: Set<number>
  /** Runs that ended otherwise than the engine's evaluation */
  misrun: string[]
  runs: number
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a value is one of those a Known admits. */
const admits = (known: Known, value: unknown): boolean =>
  known.some((member) => {
    if ('exact' in member) return Object.is(member.exact, value) || deepEqual(member.exact, value)
    switch (member.type) {
      case 'string':
      case 'boolean':
        return typeof value === member.type
      case 'number':
        return typeof value === 'number' && Number.isFinite(value)
      case 'integer':
        return Number.isInteger(value)
      case 'nonFinite':
        return typeof value === 'number' && !Number.isFinite(value)
      case 'null':
        return value === null
      case 'opaque':
        return typeof value === 'function' || (isPlain(value) && !isPlainData(value))
      case 'array':
        if (!Array.isArray(value)) return false
        if (member.length !== undefined && value.length !== member.length) return false
        if (member.items !== undefined) return value.every((v, i) => admits(member.items![i], v))
        return member.element === undefined || value.every((v) => admits(member.element!, v))
      case 'object':
        if (!isPlain(value)) return false
        if (member.keys === undefined) return true
        return (
          Object.keys(value).every((key) => Object.hasOwn(member.keys!, key)) &&
          Object.entries(member.keys).every(([key, inner]) => admits(inner, value[key] ?? null))
        )
    }
  })

const isPlainData = (value: object) => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

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
    const elements: Record<string, Known> = {}
    for (const [name] of definition.resolution.perElement)
      if (Object.hasOwn(values, name)) elements[name] = outputs[name]
    const { output, boundary } = operatorOutput(node, inputs, elements, level.numbers)
    if (boundary !== undefined) predicted.add(boundary.code)
    const answers = rules.map((rule) =>
      inputs.propagates === 'yes'
        ? 'no'
        : answerRule(node, rule, inputs, { numbers: level.numbers, evaluation: level.evaluation })
    )
    rules.forEach((rule, r) => answers[r] !== 'no' && predicted.add(rule.code))

    let failed: string | undefined
    let result: unknown
    try {
      result = await level.fig.evaluate(expression, { data: values })
    } catch (error) {
      if (!isFigTreeError(error)) throw error
      failed = error.code
    }

    // The run, with each child known exactly: a lazy parameter or an `each`
    // is a child the body asks for, the rest are values
    const given: Record<string, Known> = {}
    const children: Child[] = []
    for (const name of present) {
      const { evaluation } = definition.parameters[name]
      const result = { verdict: 'no' as const, escapes: [], output: outputs[name] }
      if (evaluation === 'lazy' || evaluation === 'perElement')
        children.push({ param: name, result })
      if (evaluation !== 'perElement') given[name] = outputs[name]
    }
    const ran = await runNode(node, given, children, level)
    if (ran !== undefined) {
      report.runs++
      const ends = ran.fails
        ? ran.failures.filter((f) => f.certainty === 'always').map((f) => f.code)
        : ran.output.map((member) => JSON.stringify((member as { exact: unknown }).exact, replacer))
      const expected = failed ?? JSON.stringify(result, replacer)
      if ((ends.length !== 1 || ends[0] !== expected) && report.misrun.length < 8)
        report.misrun.push(
          `${expected}, but the run ended ${JSON.stringify(ends)}, with ${JSON.stringify(values, replacer)}`
        )
    }
    if (failed === undefined) {
      if (!admits(output, result) && report.unadmitted.length < 8)
        report.unadmitted.push(
          `${JSON.stringify(result, replacer)} with ${JSON.stringify(values, replacer)}`
        )
      continue
    }
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
      const report: Report = {
        unpredicted: [],
        unadmitted: [],
        fired: new Set(),
        misrun: [],
        runs: 0,
      }
      for (const level of LEVELS) await check(definition, level, report)
      expect(report.unpredicted).toEqual([])
      expect(report.unadmitted).toEqual([])
      expect(report.misrun).toEqual([])
      expect(report.runs).toBeGreaterThan(0)
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
