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

const timeIterations = async (label: string, action: () => Promise<unknown>) => {
  const durations: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now()
    await action()
    durations.push(performance.now() - start)
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const total = durations.reduce((a, b) => a + b, 0)
  const mean = total / durations.length

  console.log(`\n${label} (${ITERATIONS} iterations)`)
  console.log(`  min:    ${sorted[0].toFixed(3)}ms`)
  console.log(`  median: ${percentile(sorted, 0.5).toFixed(3)}ms`)
  console.log(`  mean:   ${mean.toFixed(3)}ms`)
  console.log(`  total:  ${total.toFixed(1)}ms`)

  return { min: sorted[0], median: percentile(sorted, 0.5), mean, total }
}

const main = async () => {
  const exp = new FigTreeEvaluator(config)

  console.log('Benchmarking FigTreeEvaluator: compiled vs non-compiled')
  console.log('Fixture: test/massiveQuery.json (~20,000 nodes)')

  const uncompiled = await timeIterations('Non-compiled', () =>
    exp.evaluate(massiveQuery, config)
  )

  const compileStart = performance.now()
  const compiled = exp.compile(massiveQuery)
  const compileTime = performance.now() - compileStart
  console.log(`\nOne-time compile() cost: ${compileTime.toFixed(3)}ms`)

  const compiledResult = await timeIterations('Compiled', () => exp.evaluate(compiled, config))

  const speedup = uncompiled.mean / compiledResult.mean
  const breakEven = compileTime / (uncompiled.mean - compiledResult.mean)

  console.log(`\nSpeedup (mean): ${speedup.toFixed(2)}x`)
  console.log(
    breakEven > 0 && Number.isFinite(breakEven)
      ? `Break-even: compile() pays for itself after ~${Math.ceil(breakEven)} evaluation(s)`
      : 'Break-even: not applicable (no measurable per-call saving)'
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
