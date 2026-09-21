/**
 * Phase 4 showcase — `pnpm dev phase4_showcase`. Runs a range of
 * expressions through `evaluate()` and prints what comes back: the
 * evaluator core (identity, skeleton splicing, references, the static
 * gate), the engine layers (null policy, defaults, type checks,
 * truthiness, fallback, the result boundary), the 24 eager operators, and
 * a custom operator written against the contract. Every phase closes with
 * one of these (implementation-plan working rule 7).
 */
import { FigTree, defineOperator, OperatorFailure } from '../index'
import { outcome, print, section } from './showcase'

const fig = new FigTree({ data: { org: 'Acme' } })

const show = async (
  label: string,
  expression: unknown,
  options: Parameters<FigTree['evaluate']>[1] = {},
  instance: FigTree = fig
) => print(label, expression, await outcome(() => instance.evaluate(expression, options), true))

const main = async () => {
  section('The evaluator core')
  const config = { title: 'static', tags: ['a', 'b'] }
  console.log(
    `  identity: a constant input comes back as the same reference → ${(await fig.evaluate(config)) === config}\n`
  )
  await show(
    'a whole config: holes spliced into a copy of the constant shape',
    {
      greeting: { $plus: ['Welcome to ', '$data.org'] },
      user: { name: { $upper: '$data.user.name' }, tags: '$data.user.tags' },
      meta: { generated: 'showcase', version: 4 },
    },
    { data: { user: { name: 'ada', tags: ['x', 'y'] } } }
  )
  await show('bare $data is the merged data object', '$data', { data: { extra: 1 } })
  await show('drilled reference with [*] projection', '$data.orders[*].total', {
    data: { orders: [{ total: 1 }, { total: 2 }] },
  })
  await show('a missing path is null — absence is not failure', '$data.user.phone', { data: {} })
  await show('…unless strictDataPaths is on', '$data.user.phone', {
    data: {},
    strictDataPaths: true,
  })
  await show('a literal is data, never evaluated', { $literal: { $plus: [1, 2] } })
  await show('comments and undefined are consumed', { a: 1, '//': 'a note', b: undefined })
  await show('the static gate: a typo is refused before anything evaluates', {
    $plus: [1, { operator: 'pluss', values: [2, 3] }],
  })
  await show('the static gate: surplus positional arguments', { $round: [1, 2, 3] })

  section('Arithmetic & math')
  await show('plus adds numbers', { $plus: [7.5, 25, -0.1, 6] })
  await show('plus concatenates strings', { $plus: ['Tony', ' ', 'Stark'] })
  await show('plus concatenates arrays', { '$+': [[1, 2], [3], [[4]]] })
  await show('plus merges objects, later keys win', {
    $plus: [
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    ],
  })
  await show('no coercion: mixed operands fail', { $plus: [1, '2'] })
  await show(
    'expect asserts the mode',
    { $plus: { values: '$data.scores', expect: 'number' } },
    { data: { scores: [1, '2'] } }
  )
  await show(
    'expect gives an empty input its identity',
    { $plus: { values: '$data.empty', expect: 'number' } },
    { data: { empty: [] } }
  )
  await show(
    'an unpinned empty sum is a failure',
    { $plus: '$data.empty' },
    { data: { empty: [] } }
  )
  await show('subtract / divide / modulo read as spoken', {
    operator: 'subtract',
    value: 10,
    minus: 3,
  })
  await show('divide by zero fails through the finite guard', { $divide: [1, 0] })
  await show('modulo is floored', { $modulo: [-7, 3] })
  await show(
    'multiply; an empty product is 1',
    { $multiply: '$data.empty' },
    { data: { empty: [] } }
  )
  await show('power', { '$^': [2, 10] })
  await show('round ties half away from zero', { $round: [-2.5] })
  await show('round works on the decimal representation', { $round: [1.005, 2] })
  await show('negative decimals round to hundreds', { $round: [1234, -2] })
  await show('floor / ceil / abs', [{ $floor: -3.5 }, { $ceil: -3.5 }, { $abs: -12 }])
  await show('max on ISO timestamps (codepoint order)', { $max: ['2024-01-05', '2023-12-31'] })
  await show('min on mixed types fails', { $min: '$data.mixed' }, { data: { mixed: [1, 'a'] } })

  section('Comparison')
  await show('equal is deep and key-order-insensitive', {
    $equal: [
      { a: 1, b: [1, 2] },
      { b: [1, 2], a: 1 },
    ],
  })
  await show('equal across types is false, never an error', { '$=': [1, '1'] })
  await show('equal is total over one element', { $equal: ['solo'] })
  await show('caseInsensitive folds strings', {
    $equal: { values: ['MonDay', 'monDAY'], caseInsensitive: true },
  })
  await show('notEqual is "not all equal"', { '$!=': [1, 2, 1] })
  await show('the is-set idiom', { $notEqual: ['$data.x', null] }, { data: { x: 0 } })
  await show('greaterThan / lessThanOrEqual', [{ '$>': [5, 3] }, { '$<=': [99.5, 99.5] }])
  await show('uppercase sorts first; string order is not numeric', [
    { '$<': ['Z', 'a'] },
    { '$<': ['10', '9'] },
  ])
  await show('exactly two operands', { $greaterThan: [1, 2, 3] })
  await show(
    'heterogeneous operands fail',
    { $lessThan: '$data.pair' },
    { data: { pair: [1, 'a'] } }
  )

  section('Strings, length, convert')
  await show('split with the default space delimiter', { $split: 'one two  three' })
  await show('split keeps empty fields (CSV)', { $split: ['a,,b,', ','] })
  await show('an empty delimiter splits into code points', { $split: ['a😀b', ''] })
  await show('lower / upper / trim', [
    { $lower: 'HeLLo' },
    { $upper: 'straße' },
    { $trim: '  padded  ' },
  ])
  await show('strict strings: a number is a type error', { $lower: '$data.n' }, { data: { n: 42 } })
  await show('length counts code points on strings', { $length: '😀😀' })
  await show('length of an array', { $length: [1, 2, 3] })
  await show('convert to number is strict', { $convert: [' 42 ', 'number'] })
  await show('convert refuses to mine numbers from text', { $convert: ['15 grams', 'number'] })
  await show('convert to string renders scalars only', { $convert: [{ $plus: [1, 2] }, 'string'] })
  await show('convert to boolean: the "false" carve-out', { $convert: ['FALSE', 'boolean'] })
  await show('convert to boolean consumes null (the conditional policy)', {
    $convert: ['$data.missing', 'boolean'],
  })
  await show('convert to number propagates null', { $convert: ['$data.missing', 'number'] })
  await show('convert to array wraps', { $convert: [4, 'array'] })

  section('The null gradient')
  await show('row 3: a null operand propagates', { $plus: ['$data.missing', 5] })
  await show('…and a fallback is ignored (success, not failure)', {
    $plus: ['$data.missing', 5],
    fallback: 'F',
  })
  await show('nullValueDefault replaces the null before the sum', {
    $plus: { values: ['$data.missing', 5], nullValueDefault: 0 },
  })
  await show('row 10: >= on two nulls is null, not true', {
    $greaterThanOrEqual: ['$data.a', '$data.b'],
  })
  await show('nullValueDefault makes the comparison total', {
    $greaterThan: { values: ['$data.age', 18], nullValueDefault: 0 },
  })
  await show('row 13: a null candidate in min', { $min: [3, '$data.missing', 7] })
  await show(
    'row 14: null at optional decimals means unset',
    { $round: ['$data.price', null] },
    { data: { price: 3.7 } }
  )
  await show(
    'a null at a required, non-nullable position is a type error',
    { $convert: ['x', '$data.to'] },
    { data: { to: null } }
  )

  section('Fallback')
  await show('rule 1: the nearest enclosing fallback catches', {
    $round: { $divide: [1, 0] },
    fallback: 'n/a',
  })
  await show('(a static check, not a fallback case: divide can never feed upper)', {
    $upper: { $divide: [1, 0] },
    fallback: 'n/a',
  })
  await show('…through arrays and plain literals', {
    $length: [1, { $divide: [1, 0] }],
    fallback: -1,
  })
  await show('the innermost wins', {
    $plus: [{ $divide: [1, 0], fallback: 0 }, 1],
    fallback: 'outer',
  })
  await show(
    'fallback is an expression',
    { $divide: [1, 0], fallback: '$data.backup' },
    { data: { backup: 'b' } }
  )
  await show('rule 4: a failing fallback fails the node, original as cause', {
    $divide: [1, 0],
    fallback: { $modulo: [1, 0] },
  })
  await show('rule 2: static errors are never caught', {
    $plus: [1, { operator: 'nope' }],
    fallback: 0,
  })

  section('operatorDefaults — instance-wide parameter and fallback defaults')
  const host = new FigTree({
    operatorDefaults: {
      equal: { caseInsensitive: true },
      plus: { nullValueDefault: 0, fallback: 0 },
      divide: { fallback: null },
    },
  })
  await show(
    'equal is case-insensitive on this instance',
    { $equal: ['MonDay', 'monDAY'] },
    {},
    host
  )
  await show(
    '…but the node key still wins',
    { $equal: { values: ['MonDay', 'monDAY'], caseInsensitive: false } },
    {},
    host
  )
  await show(
    'plus treats missing operands as 0',
    { $plus: ['$data.a', '$data.b', 5] },
    { data: { b: 2 } },
    host
  )
  await show(
    'an empty sum degrades to the default fallback',
    { $plus: '$data.empty' },
    { data: { empty: [] } },
    host
  )
  await show('divide by zero degrades to null', { $divide: [1, 0] }, {}, host)
  console.log(
    `  validate() sees the default fallbacks as shielding: ${host.validate({ a: { $plus: [1] }, b: { $divide: [1, 2] } }).timeoutShielded}\n`
  )

  section('A custom operator, written against the contract')
  const clamp = defineOperator({
    name: 'clamp',
    category: 'math',
    description: 'Constrain a number to a range',
    parameters: {
      value: { type: ['number', 'null'] },
      min: { type: 'number', default: 0 },
      max: { type: 'number', default: 1 },
    },
    positionalParams: ['value', 'min', 'max'],
    returns: 'number',
    // params are typed from the declarations: value is number (null was
    // propagated away), min and max are numbers (defaults always apply)
    evaluate: ({ value, min, max }) => Math.min(max, Math.max(min, value)),
  })
  const greet = defineOperator({
    name: 'greet',
    category: 'string',
    description: 'Greet someone, reading the options http block for a base URL',
    parameters: {
      name: { type: 'string' },
      shout: { type: 'any', truthiness: true, required: false },
    },
    positionalParams: ['name'],
    returns: 'string',
    evaluate: ({ name, shout }, context) => {
      if (name === 'nobody')
        throw new OperatorFailure('nobody is not a person', {
          code: 'not-a-person',
          errorData: { name },
        })
      const base = context.options.http?.baseEndpoint ?? 'nowhere'
      const text = `Hello ${name} (from ${base})`
      return shout ? text.toUpperCase() : text
    },
  })
  const custom = new FigTree({
    operators: [clamp, greet],
    http: { baseEndpoint: 'https://api.example.com' },
  })
  await show('clamp with defaults', { $clamp: [5] }, {}, custom)
  await show('clamp with a range', { $clamp: [5, 0, 10] }, {}, custom)
  await show(
    'clamp propagates null — the body never sees it',
    { $clamp: ['$data.missing', 0, 10] },
    {},
    custom
  )
  await show('greet reads the http option block', { $greet: 'Ada' }, {}, custom)
  await show(
    'a truthiness position delivers a boolean',
    { $greet: { name: 'Ada', shout: 'yes' } },
    {},
    custom
  )
  await show('OperatorFailure carries code and errorData through', { $greet: 'nobody' }, {}, custom)
  await show(
    'the registry is exhaustive: with no plus registered, $plus is inert data',
    { $plus: [1, 2] },
    {},
    custom
  )

  section('validate() — the same spine, without evaluating')
  // The instance carries data ({ org: 'Acme' }), so the sample-data check
  // runs too and warns about every $data path absent from it
  const report = fig.validate({
    total: { $plus: { values: [], expect: 'number' } },
    check: { '$>': ['$data.age', 'eighteen'] },
    name: { $uper: '$data.name' },
    ratio: { $round: [{ $equal: [1, 1] }] },
  })
  console.log(`  valid: ${report.valid}, timeoutShielded: ${report.timeoutShielded}\n`)
  for (const issue of report.issues)
    console.log(
      `  ${issue.severity.padEnd(7)} ${issue.code.padEnd(24)} ${JSON.stringify(issue.path).padEnd(14)} ${issue.message}`
    )
  console.log()
}

main()
