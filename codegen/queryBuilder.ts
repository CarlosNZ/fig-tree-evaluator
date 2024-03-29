/*
`generateMassiveQuery` builds an enormous evaluator expression tree using some
simple, interconnected `baseExpressions`. The resulting expression is output to
`massiveQuery.json` in the "test" folder and used by the "complexExpressions"
tests.

With a depth_limit of 30, the resulting expression tree has over 20,000 nodes
*/

import { writeFileSync } from 'fs'
import { EvaluatorNode, EvaluatorOutput, OperatorNode } from '../src/types'
import { FigTreeEvaluator } from '../src/'
import { isOperatorNode } from '../src/helpers'

const DEPTH_LIMIT = 30

const data = {
  somewhere: { quite: { deep: 'This ' }, not: { so: { deep: 'has ', quiet: ['%2 ', '%3 '] } } },
  tence: '[0]',
  number: [0, 500],
  500: '[1]',
}

const functions = {
  words: () => 'sen',
  sen: () => 'not',
  tence: () => 'somewhere.not.so.deep',
  not: (str: string) => 'somewhere.not.so.quiet' + str,
  too: (str: string) => 'somewhere.not.so.quiet' + str,
  '666': (val: string) => (val === 'words' ? '^%d$' : '%4 '),
}

export const config = { data, functions }

const evaluator = new FigTreeEvaluator({ data, functions })

const baseExpressions: EvaluatorNode[] = [
  {
    operator: 'stringSubstitution',
    string: 'This %1 has %2 %3 %4 words',
    replacements: ['sentence', 'too', 'many', 'missing'],
  },
  {
    operator: '+',
    values: ['sen', 'tence'],
  },
  { operator: '?', condition: true, valueIfTrue: 'too', valueIfFalse: 'not' },
  { operator: '?', condition: true, valueIfTrue: 'many', valueIfFalse: 'not' },
  { operator: 'and', values: [true, true] },
  { operator: 'and', values: [true, false, false] },
  { operator: 'or', values: [true, false] },
  { operator: 'and', values: [false, false, false] },
  { operator: '=', values: ['sen', 'sen', 'sen'] },
  { operator: '+', children: ['This ', '%1 ', 'has ', '%2 ', '%3 ', '%4 ', 'words'] },
  {
    operator: '?',
    children: [{ operator: 'ne', children: ['This ', 'This '] }, 'This ', 'missing'],
  },
  { operator: 'regex', testString: '%1 ', pattern: '^%d$' },
  { operator: 'objectProperties', property: 'somewhere.quite.deep' },
  { operator: 'objectProperties', property: 'somewhere.not.so.deep' },
  { operator: 'objectProperties', property: 'somewhere.not.so.quiet[0]' },
  { operator: 'objectProperties', property: 'somewhere.not.so.quiet[1]' },
  { operator: 'function', functionPath: 'words' },
  { operator: 'function', functionPath: 'sen' },
  { operator: 'function', functionPath: 'tence' },
  { operator: 'function', functionPath: 'not', args: ['[0]'] },
  { operator: 'function', functionPath: 'too', args: ['[1]'] },
  { operator: 'conditional', children: [true, '%1 ', 'words'] },
  { operator: 'conditional', children: [true, 'tence', 666] },
  {
    operator: 'getProperty',
    path: { operator: '+', values: ['words', '[0]'] },
    fallback: 'somewhere.quite.deep',
  },
  {
    operator: 'getProperty',
    path: 'not',
    fallback: 'words',
  },
  {
    operator: '?',
    condition: true,
    valueIfTrue: 666,
    valueIfFalse: 500,
  },
  { operator: 'plus', values: [1, 500, 165] },
  { operator: 'functions', funcName: '666', args: ['words'] },
  { operator: 'functions', funcName: '666', args: ['somewhere.not.so.deep'] },
  { operator: 'passThru', outputType: 'string', value: 666 },
  { operator: '?', children: [false, 'tence', 'string'] },
  { operator: 'getProperty', path: 'tence' },
  { operator: 'getProperty', path: '500' },
  { operator: 'getProperty', path: { operator: '+', values: ['number', '[1]'] }, type: 'string' },
  { operator: 'getProperty', path: { operator: '+', values: ['number', '[1]'] } },
  { operator: 'passThru', value: { sentence: '%4', 'This %1 has %2 %3 %4 words': 666 } },
  { operator: 'and', values: [true, true, true], outputType: 'number' },
  { operator: 'objectProperties', path: 'sen', fallback: 'number' },
  { operator: 'CONDITIONAL', children: [true, 165, '%4 '] },
]

const outputMap: Map<EvaluatorOutput, number[]> = new Map()

const replaceNodeValues = (input: EvaluatorNode, depth = 1): EvaluatorNode => {
  if (isOperatorNode(input)) {
    // Iterate over keys and replace values (returning new object)
    return Object.fromEntries(
      Object.entries(input as OperatorNode).map(([key, val]) => {
        if (key === 'operator') return [key, val]
        else return [key, replaceNodeValues(val, depth + 1)]
      })
    )
  }
  if (input instanceof Array) return input.map((elem) => replaceNodeValues(elem, depth + 1))
  if (outputMap.has(input)) {
    const baseExpression = baseExpressions[getOutputMapIndex(input)]
    return depth < DEPTH_LIMIT ? replaceNodeValues(baseExpression, depth + 1) : baseExpression
  }
  console.log(`Missing expression for result: ${input} : ${typeof input}`)
  return input
}

const generateOutputMap = async () => {
  const results = await Promise.all(
    baseExpressions.map((expression) => evaluator.evaluate(expression))
  )
  console.log('Results of base expressions: ')
  baseExpressions.forEach((exp, i) => {
    console.log(exp)
    console.log('RESULT: ', results[i], '\n')
  })
  results.forEach((res, index) => {
    const key = res instanceof Object ? JSON.stringify(res) : res
    const vals = outputMap.get(key)
    if (vals) vals.push(index)
    else outputMap.set(key, [index])
  })
  console.log(outputMap)
}

const getOutputMapIndex = (input: EvaluatorNode) => {
  const key = input instanceof Object ? JSON.stringify(input) : input
  const indexArray = outputMap.get(key) ?? []
  return indexArray[Math.floor(Math.random() * indexArray.length)]
}

export const generateMassiveQuery = async () => {
  await generateOutputMap()
  const massiveQuery = replaceNodeValues(baseExpressions[0] as OperatorNode)
  writeFileSync('test/massiveQuery.json', JSON.stringify(massiveQuery, null, 2))
  return massiveQuery
}
