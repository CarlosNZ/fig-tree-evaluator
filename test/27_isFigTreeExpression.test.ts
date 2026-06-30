import { FigTreeEvaluator } from './evaluator'
import { type EvaluatorNode } from '../src'

/*
Tests for the new *instance* method `figTree.isFigTreeExpression(expression)`.

Unlike the stand-alone `isFigTreeExpression` export (purely structural, kept
as-is for backwards compatibility), this method is registry-aware and mirrors
what *this* evaluator would actually do, following the instance's
`evaluateFullObject` setting. The question it answers: "is it worth sending this
to the evaluator?".

Agreed rules:
  - TRUE immediately (both modes) if the node is an operator node, a fragment
    node, or an object with any *registered* shorthand key ($operator /
    $fragment / $function). Invalid/unknown operator & fragment NAMES still
    count (the evaluator still treats them as nodes → error/fallback).
  - Arrays are always recursed (both modes) — true if any element is true.
  - A plain object (no operator/fragment/shorthand key) is only descended when
    `evaluateFullObject` is on. In the default mode it's returned untouched, so
    it's false.
  - Alias DEFINITIONS ($-prefixed keys that aren't registered shorthand) don't
    count on their own, but their VALUES are still walked (an operator inside a
    definition counts). An alias REFERENCE (a "$x" string value) counts only if
    a matching definition is IN SCOPE — i.e. on the same node or an ancestor
    (definitions cascade down to descendants). A definition in a sibling branch
    or a descendant does NOT resolve, so such references are no-ops. (Note: this
    scope reasoning only ever matters in the evaluateFullObject + no-operator
    fallback; an operator/fragment/shorthand node short-circuits to true first.)

Note the deliberate divergence: under `evaluateFullObject`, the evaluator strips
every $-key, so `{ "$greeting": "Hi" }` actually becomes `{}` (an output change).
We still report that as false — a lone definition with nothing consuming it isn't
worth evaluating, and this keeps junk $-keys reporting false in both modes.

WARNING when picking alias names for tests: many short words/letters are operator
aliases (`x` → MULTIPLY, `data` → OBJECT_PROPERTIES, `count`, `get`, `_`, etc.).
A `$`-key whose stripped name is a registered alias is *shorthand* (→ operator
node), NOT an alias definition. Alias-definition cases below use names that are
definitely not in the alias map (greeting, message, payload, base, ref1...).
*/

const options = {
  returnErrorAsString: true,
  data: {
    user: { firstName: 'Steve', lastName: 'Rogers' },
    org: { name: 'Avengers' },
  },
  functions: {
    double: (n: number) => n * 2,
    getPrincess: (name: string) => `Princess ${name}`,
  },
  fragments: {
    myFragment: { operator: '+', values: [1, 2] },
    greetingFragment: 'Hello there',
  },
}

// Identical registries, differing only in `evaluateFullObject`
const fig = new FigTreeEvaluator({ ...options, evaluateFullObject: false })
const figFull = new FigTreeEvaluator({ ...options, evaluateFullObject: true })

interface Case {
  name: string
  expression: EvaluatorNode
  default: boolean // evaluateFullObject: false (the default)
  full: boolean // evaluateFullObject: true
}

const check = (cases: Case[]) =>
  test.each(cases)(
    '$name  →  default: $default | full: $full',
    ({ expression, default: expDefault, full: expFull }) => {
      expect(fig.isFigTreeExpression(expression)).toBe(expDefault)
      expect(figFull.isFigTreeExpression(expression)).toBe(expFull)
    }
  )

describe('Primitives & plain data', () => {
  check([
    { name: 'number', expression: 42, default: false, full: false },
    { name: 'string', expression: 'plain text', default: false, full: false },
    { name: 'boolean', expression: true, default: false, full: false },
    { name: 'null', expression: null, default: false, full: false },
    { name: 'empty object', expression: {}, default: false, full: false },
    { name: 'empty array', expression: [], default: false, full: false },
    {
      name: 'plain object',
      expression: { firstName: 'Steve', age: 30 },
      default: false,
      full: false,
    },
    { name: 'plain array', expression: [1, 2, 3], default: false, full: false },
    {
      name: 'plain array of strings/numbers',
      expression: ['just', 'strings', 42],
      default: false,
      full: false,
    },
    {
      // even with full descent, all leaves are plain data → false
      name: 'deeply nested plain object',
      expression: { a: { b: { c: 'deep' } } },
      default: false,
      full: false,
    },
  ])
})

describe('Operator nodes (structural → true in both modes)', () => {
  check([
    {
      name: 'operator node',
      expression: { operator: '+', values: [1, 2] },
      default: true,
      full: true,
    },
    {
      name: 'operator node (alias name)',
      expression: { operator: 'getData', property: 'user.firstName' },
      default: true,
      full: true,
    },
    {
      // unknown operator NAME is still a node → evaluator errors/falls back
      name: 'operator node with invalid operator',
      expression: { operator: 'notARealOperator', values: [1] },
      default: true,
      full: true,
    },
  ])
})

describe('Shorthand keys (registered → true in both modes)', () => {
  check([
    { name: 'shorthand operator', expression: { $plus: [1, 2] }, default: true, full: true },
    {
      name: 'shorthand operator (alias)',
      expression: { $getData: 'user.firstName' },
      default: true,
      full: true,
    },
    { name: 'shorthand &&', expression: { $and: [true, false] }, default: true, full: true },
    {
      // GOTCHA: `x` is the MULTIPLY alias, so this is shorthand, not an alias def
      name: 'single-letter operator alias shorthand ($x = MULTIPLY)',
      expression: { $x: 5 },
      default: true,
      full: true,
    },
    {
      // multi-key shorthand: still promoted to an operator node by the evaluator
      name: 'multi-key shorthand operator',
      expression: { $plus: [1, 2], note: 'a sum' },
      default: true,
      full: true,
    },
    {
      name: 'shorthand custom function',
      expression: { $double: [5] },
      default: true,
      full: true,
    },
    {
      name: 'shorthand fragment',
      expression: { $myFragment: {} },
      default: true,
      full: true,
    },
  ])
})

describe('Unregistered / junk $-keys (the fix → false in both modes)', () => {
  check([
    {
      name: 'single junk $-key',
      expression: { $somethingUnregistered: 1 },
      default: false,
      full: false,
    },
    {
      name: 'junk $-key with string value',
      expression: { $notRegistered: 'data' },
      default: false,
      full: false,
    },
    {
      name: 'unregistered fragment-looking key',
      expression: { $unregisteredFragmentName: { foo: 'bar' } },
      default: false,
      full: false,
    },
    {
      name: 'junk $-key alongside normal key',
      expression: { $junk: 1, normalKey: 'x' },
      default: false,
      full: false,
    },
  ])
})

describe('Fragment nodes (structural → true in both modes)', () => {
  check([
    { name: 'fragment node', expression: { fragment: 'myFragment' }, default: true, full: true },
    {
      // unknown fragment NAME is still a node → evaluator errors/falls back
      name: 'fragment node with unregistered name',
      expression: { fragment: 'notRegistered' },
      default: true,
      full: true,
    },
    {
      name: 'fragment node with parameters',
      expression: { fragment: 'myFragment', parameters: { x: 1 } },
      default: true,
      full: true,
    },
  ])
})

describe('Alias references & definitions', () => {
  check([
    {
      // orphan reference: resolves to itself at the root → no-op
      name: 'bare alias reference (no definition)',
      expression: '$user',
      default: false,
      full: false,
    },
    {
      name: 'orphan alias references in array',
      expression: ['$ref1', '$ref2'],
      default: false,
      full: false,
    },
    {
      // definition only, nothing consumes it (see header note re: divergence).
      // Evaluator actually strips this to {} under full — we still report false.
      name: 'alias definition only',
      expression: { $greeting: 'Hi' },
      default: false,
      full: false,
    },
    {
      name: 'alias reference only (no definition)',
      expression: { message: '$missing' },
      default: false,
      full: false,
    },
    {
      // definition + matching reference → resolves only when object is descended.
      // Evaluator: default unchanged (no-op), full → { message: 'Hi' }
      name: 'alias definition + matching reference',
      expression: { $greeting: 'Hi', message: '$greeting' },
      default: false,
      full: true,
    },
    {
      // definition's VALUE is an operator → counts when descended
      name: 'alias definition whose value is an operator',
      expression: { $payload: { operator: '+', values: [1, 2] } },
      default: false,
      full: true,
    },
    {
      // operator node short-circuits before any alias bookkeeping
      name: 'operator node carrying alias definition + reference',
      expression: { operator: '+', $base: 10, values: ['$base', 5] },
      default: true,
      full: true,
    },
  ])
})

describe('Nesting in plain objects (gated by evaluateFullObject)', () => {
  check([
    {
      name: 'operator nested in plain object',
      expression: { user: { name: { $getData: 'user.firstName' } } },
      default: false,
      full: true,
    },
    {
      name: 'operator node nested in plain object',
      expression: { a: 1, b: { c: { operator: '+', values: [1, 2] } } },
      default: false,
      full: true,
    },
    {
      // object → array → object: array recursion is reached only via descent
      name: 'operator nested via object → array → object',
      expression: { a: [{ b: { $plus: [1, 2] } }] },
      default: false,
      full: true,
    },
  ])
})

describe('Nesting in arrays (always recursed, both modes)', () => {
  check([
    {
      name: 'array containing shorthand',
      expression: [1, { $plus: [1, 2] }, 3],
      default: true,
      full: true,
    },
    {
      name: 'array containing operator node',
      expression: [{ operator: '+', values: [1, 2] }],
      default: true,
      full: true,
    },
    {
      name: 'nested arrays containing shorthand',
      expression: [1, [2, { $plus: [1, 2] }]],
      default: true,
      full: true,
    },
    {
      // array element is a plain object → that object is only descended under full
      name: 'array containing plain object wrapping an operator',
      expression: ['plain', { nested: { $getData: 'user.firstName' } }],
      default: false,
      full: true,
    },
  ])
})

describe('Alias reference scoping', () => {
  // --- Operator nodes: true/true regardless of whether the alias resolves,
  // because the operator node itself short-circuits. The evaluated result (in
  // comments) is shown only to document the underlying scoping behaviour. ---
  check([
    {
      // THE EXAMPLE: same-level def + ref → resolves (evaluates to 84).
      // Property order is irrelevant: the node's $-keys are collected before
      // `values` is evaluated.
      name: 'operator node: same-level alias def + ref',
      expression: { operator: '+', values: ['$one', '$two'], $one: 55, $two: 29 },
      default: true,
      full: true,
    },
    {
      // def on parent, ref in child → resolves (evaluates to 1001)
      name: 'operator node: def on parent, ref in child (resolves)',
      expression: {
        operator: '+',
        $shared: 1000,
        values: [{ operator: '+', values: ['$shared', 1] }],
      },
      default: true,
      full: true,
    },
    {
      // ref in child, def in sibling → does NOT resolve (evaluates to "0$sib"),
      // but it's still an operator node, so still an expression worth evaluating
      name: 'operator node: ref in child, def in sibling (does not resolve)',
      expression: { operator: '+', values: [{ operator: '+', $sib: 5, values: [0] }, '$sib'] },
      default: true,
      full: true,
    },
    {
      // ref above its def → does NOT resolve (evaluates to "$fromChild0")
      name: 'operator node: ref above its definition (does not resolve)',
      expression: {
        operator: '+',
        values: ['$fromChild', { operator: '+', $fromChild: 7, values: [0] }],
      },
      default: true,
      full: true,
    },
  ])

  // --- Plain objects: here scope actually decides the result. Default is
  // always false (objects aren't descended); full depends on whether the ref
  // resolves. ---
  check([
    {
      // def at ancestor, ref two levels down → resolves → full true
      name: 'plain object: def at ancestor, ref in descendant (resolves)',
      expression: { $top: 'X', mid: { deep: { ref: '$top' } } },
      default: false,
      full: true,
    },
    {
      // ref above its def → does not resolve. Evaluator strips the child's def
      // (child → {}) but the ref stays unresolved, so per our rule → false.
      name: 'plain object: ref above its definition (does not resolve)',
      expression: { ref: '$fromChild', child: { $fromChild: 7 } },
      default: false,
      full: false,
    },
    {
      // def in sibling branch → does not resolve (sibling "a" → {}, ref stays)
      name: 'plain object: def in sibling branch (does not resolve)',
      expression: { a: { $sib: 5 }, b: { ref: '$sib' } },
      default: false,
      full: false,
    },
  ])
})

/*
DESIGN DECISION — excluded operators.

An excluded operator is still recognised as an operator (resolved via the global
alias map) and the evaluator still processes it, returning an "Excluded operator"
error/fallback. So structurally it's still a FigTree expression, and we return
TRUE — consistent with how an *invalid* operator name is treated above.

Flip these to `false` if you'd rather the guard reflect only this instance's
*usable* operators (i.e. check against the exclusion-filtered set).
*/
describe('Excluded operators (design decision — currently true)', () => {
  const figExcluded = new FigTreeEvaluator({ ...options, excludeOperators: ['getData'] })

  test('excluded operator node', () => {
    expect(
      figExcluded.isFigTreeExpression({ operator: 'getData', property: 'user.firstName' })
    ).toBe(true)
  })

  test('excluded operator shorthand', () => {
    expect(figExcluded.isFigTreeExpression({ $getData: 'user.firstName' })).toBe(true)
  })

  test('non-excluded operator still true', () => {
    expect(figExcluded.isFigTreeExpression({ $plus: [1, 2] })).toBe(true)
  })
})
