/*
Benchmark: compiled vs non-compiled evaluation of the same expression tree,
run repeatedly (simulating the common "build once, evaluate many times over
different data" usage pattern).

Run with: yarn benchmark
*/

import { FigTreeEvaluator } from '../src'
import massiveQuery from '../test/massiveQuery.json'
import { config } from '../codegen/queryBuilder'

const ITERATIONS = 200

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]

const timeIterations = async (
  label: string,
  action: () => Promise<unknown>,
  iterations: number = ITERATIONS
) => {
  const durations: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await action()
    durations.push(performance.now() - start)
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const total = durations.reduce((a, b) => a + b, 0)
  const mean = total / durations.length

  console.log(`\n${label} (${iterations} iterations)`)
  console.log(`  min:    ${sorted[0].toFixed(3)}ms`)
  console.log(`  median: ${percentile(sorted, 0.5).toFixed(3)}ms`)
  console.log(`  mean:   ${mean.toFixed(3)}ms`)
  console.log(`  total:  ${total.toFixed(1)}ms`)

  return { min: sorted[0], median: percentile(sorted, 0.5), mean, total }
}

const reportSpeedup = (
  uncompiled: { mean: number },
  compiled: { mean: number },
  compileTime: number
) => {
  const speedup = uncompiled.mean / compiled.mean
  const breakEven = compileTime / (uncompiled.mean - compiled.mean)

  console.log(`\nSpeedup (mean): ${speedup.toFixed(2)}x`)
  console.log(
    breakEven > 0 && Number.isFinite(breakEven)
      ? `Break-even: compile() pays for itself after ~${Math.ceil(breakEven)} evaluation(s)`
      : 'Break-even: not applicable (no measurable per-call saving)'
  )
}

const massiveTreeScenario = async () => {
  const exp = new FigTreeEvaluator(config)

  console.log('\n=== Scenario 1: single massive tree, evaluated repeatedly ===')
  console.log('Fixture: test/massiveQuery.json (~20,000 nodes)')

  const uncompiled = await timeIterations('Non-compiled', () =>
    exp.evaluate(massiveQuery, config)
  )

  const compileStart = performance.now()
  const compiled = exp.compile(massiveQuery)
  const compileTime = performance.now() - compileStart
  console.log(`\nOne-time compile() cost: ${compileTime.toFixed(3)}ms`)

  const compiledResult = await timeIterations('Compiled', () => exp.evaluate(compiled, config))

  reportSpeedup(uncompiled, compiledResult, compileTime)
}

// A modest, pure expression evaluated once per "row" of data -- the reported
// real-world shape (looping evaluate() over many rows, e.g. 1,000-11,000)
const rowExpression = {
  operator: 'and',
  values: [
    { operator: '>', values: [{ operator: 'getData', property: 'user.age' }, 18] },
    {
      operator: '?',
      condition: { operator: 'getData', property: 'user.isActive' },
      valueIfTrue: true,
      valueIfFalse: {
        operator: 'stringSubstitution',
        string: '{{status}} user {{name}}',
        substitutions: {
          status: { operator: 'getData', property: 'user.status' },
          name: { operator: 'getData', property: 'user.firstName' },
        },
      },
    },
    { operator: '=', values: [{ operator: 'getData', property: 'user.role' }, 'member'] },
  ],
}

const makeRow = (i: number) => ({
  user: {
    age: 18 + (i % 50),
    isActive: i % 2 === 0,
    status: i % 2 === 0 ? 'active' : 'inactive',
    firstName: `User${i}`,
    role: i % 3 === 0 ? 'member' : 'guest',
  },
})

const rowsScenario = async (rowCount: number) => {
  const exp = new FigTreeEvaluator({})

  console.log(`\n=== Scenario 2: modest expression evaluated over ${rowCount} rows ===`)

  const uncompiled = await timeIterations(
    'Non-compiled',
    (() => {
      let i = 0
      return () => exp.evaluate(rowExpression, { data: makeRow(i++) })
    })(),
    rowCount
  )

  const compileStart = performance.now()
  const compiled = exp.compile(rowExpression)
  const compileTime = performance.now() - compileStart
  console.log(`\nOne-time compile() cost: ${compileTime.toFixed(3)}ms`)

  const compiledResult = await timeIterations(
    'Compiled',
    (() => {
      let i = 0
      return () => exp.evaluate(compiled, { data: makeRow(i++) })
    })(),
    rowCount
  )

  reportSpeedup(uncompiled, compiledResult, compileTime)
}

const main = async () => {
  console.log('Benchmarking FigTreeEvaluator: compiled vs non-compiled')

  await massiveTreeScenario()
  await rowsScenario(1000)
  await rowsScenario(11000)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
