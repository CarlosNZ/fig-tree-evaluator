/**
 * Phase-3.3 black-box suite: the check inventory ("The check inventory" in
 * docs-dev/v3-specs/v3-evaluator-methods.md is exactly this list — one
 * describe per live row; operator-specific rows ride their operators in
 * later phases). Message wording is never asserted, per the worked-examples
 * rule — codes, severities and paths only.
 */
import { FigTree } from '../src'
import type { Issue } from '../src'
import { parseOps } from './fixtures/parseRegistry'

const fig = new FigTree({ operators: [parseOps()] })

const issuesOf = (expression: unknown, options?: Parameters<FigTree['validate']>[1]) =>
  fig.validate(expression, options).issues

const errorCodes = (expression: unknown) =>
  issuesOf(expression)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code)

const warningCodes = (expression: unknown) =>
  issuesOf(expression)
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => issue.code)

describe('literal parameter values vs declared types, constraints included', () => {
  test('basic type mismatch on a literal parameter', () => {
    expect(errorCodes({ $format: { template: 5 } })).toContain('type-check')
    expect(errorCodes({ $clamp: ['abc'] })).toContain('type-check')
  })

  test('literal-union violation', () => {
    expect(errorCodes({ $plus: { values: [1], expect: 'nope' } })).toContain('type-check')
  })

  test('constraints: exact length and homogeneous element types', () => {
    expect(errorCodes({ '$>': [1, 2, 3] })).toContain('type-check')
    expect(errorCodes({ '$>': [1, 'a'] })).toContain('type-check')
    expect(errorCodes({ '$>': [1, 2] })).toHaveLength(0)
  })

  test('dynamic values pass untouched — runtime territory', () => {
    expect(errorCodes({ $format: { template: '$data.t' } })).toHaveLength(0)
  })
})

describe('missing required / unknown parameter', () => {
  test('missing required parameter', () => {
    expect(errorCodes({ $if: [true] })).toContain('missing-required')
    expect(errorCodes({ $map: '$data.orders' })).toContain('missing-required')
  })

  test('an optional parameter may be absent', () => {
    expect(errorCodes({ $clamp: [5] })).toHaveLength(0)
  })

  test('unknown parameter names error (the no-hoisting rule)', () => {
    expect(errorCodes({ operator: 'if', condition: true, then: 1, thn: 2 })).toContain(
      'unknown-node-key'
    )
  })
})

describe('unresolved references', () => {
  test('$vars must resolve in lexical scope', () => {
    expect(errorCodes({ $plus: ['$vars.nope'] })).toContain('unresolved-var')
    expect(
      errorCodes({ operator: 'plus', vars: { a: 1 }, values: ['$vars.a'] })
    ).toHaveLength(0)
  })

  test('vars resolve through enclosing scopes, plain-literal blocks included', () => {
    const expression = {
      vars: { name: 'Ada' },
      inner: { $format: ['Hi %1', '$vars.name'] },
    }
    expect(errorCodes(expression)).toHaveLength(0)
  })

  test('$params is an error outside a fragment body', () => {
    expect(errorCodes({ $format: ['%1', '$params.x'] })).toContain('unresolved-param')
  })

  test('$element/$index resolve only inside an iterator each subtree', () => {
    expect(errorCodes({ $map: ['$data.users', '$element.name'] })).toHaveLength(0)
    expect(errorCodes({ $not: '$element' })).toContain('unresolved-binding')
    expect(errorCodes({ $not: '$index' })).toContain('unresolved-binding')
  })

  test("the iterator's own input, vars and fallback are outside the binding scope", () => {
    expect(errorCodes({ operator: 'map', input: '$element', each: 1 })).toContain(
      'unresolved-binding'
    )
    expect(
      errorCodes({ operator: 'map', input: [1], each: 1, fallback: '$element' })
    ).toContain('unresolved-binding')
    expect(
      errorCodes({ operator: 'map', input: [1], each: 1, vars: { x: '$index' } })
    ).toContain('unresolved-binding')
  })

  test("a nested iterator's input sees the outer bindings", () => {
    const expression = {
      operator: 'map',
      input: '$data.orders',
      each: { operator: 'map', input: '$element.items', each: '$element' },
    }
    expect(errorCodes(expression)).toHaveLength(0)
  })
})

describe('as renaming', () => {
  test('renamed bindings resolve inside the each subtree', () => {
    const expression = {
      operator: 'map',
      input: '$data.orders',
      as: 'order',
      each: { $format: ['%1 %2', '$order.id', '$orderIndex'] },
    }
    expect(errorCodes(expression)).toHaveLength(0)
  })

  test('renaming disables $element for that iterator', () => {
    const expression = {
      operator: 'map',
      input: '$data.orders',
      as: 'order',
      each: '$element',
    }
    expect(errorCodes(expression)).toContain('unresolved-binding')
  })

  test('nested renaming reaches outer bindings by name', () => {
    const expression = {
      operator: 'map',
      input: '$data.orders',
      as: 'order',
      each: {
        operator: 'map',
        input: '$order.items',
        each: { $format: ['%1 of order %2', '$element.name', '$order.id'] },
      },
    }
    expect(errorCodes(expression)).toHaveLength(0)
  })

  test('a dynamic as is a parse error — structural means literal', () => {
    expect(
      errorCodes({ operator: 'map', input: [1], as: '$data.name', each: 1 })
    ).toContain('invalid-as')
  })

  test('as may not collide with reserved namespaces, long or short form', () => {
    for (const as of ['data', 'e', 'index', 'v']) {
      expect(errorCodes({ operator: 'map', input: [1], as, each: 1 })).toContain('invalid-as')
    }
  })

  test('as may not collide with enclosing as names, derived forms included', () => {
    const nested = (innerAs: string) => ({
      operator: 'map',
      input: [1],
      as: 'order',
      each: { operator: 'map', input: [2], as: innerAs, each: 1 },
    })
    expect(errorCodes(nested('order'))).toContain('invalid-as')
    expect(errorCodes(nested('orderIndex'))).toContain('invalid-as')
    expect(errorCodes(nested('item'))).toHaveLength(0)
  })
})

describe('vars cycles, shadowing, unreferenced', () => {
  test('cycles are validation errors', () => {
    expect(
      errorCodes({ operator: 'plus', vars: { a: '$vars.b', b: '$vars.a' }, values: ['$vars.a'] })
    ).toContain('var-cycle')
    expect(
      errorCodes({ operator: 'plus', vars: { a: '$vars.a' }, values: ['$vars.a'] })
    ).toContain('var-cycle')
  })

  test('a same-block chain without a loop is fine', () => {
    expect(
      errorCodes({ operator: 'plus', vars: { a: '$vars.b', b: 1 }, values: ['$vars.a'] })
    ).toHaveLength(0)
  })

  test('shadowing an outer name warns', () => {
    const expression = {
      vars: { a: 1 },
      inner: { operator: 'plus', vars: { a: 2 }, values: ['$vars.a'] },
    }
    expect(warningCodes(expression)).toContain('shadowed-var')
  })

  test('unreferenced vars warn per name', () => {
    const expression = { operator: 'plus', vars: { used: 1, dead: 2 }, values: ['$vars.used'] }
    const warnings = issuesOf(expression).filter((issue) => issue.code === 'unreferenced-var')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].path).toEqual(['vars', 'dead'])
  })

  test('a fallback evaluates in its node scope — vars references resolve', () => {
    const expression = {
      operator: 'http',
      url: 'https://x.test',
      vars: { alt: 'cached' },
      fallback: '$vars.alt',
    }
    expect(errorCodes(expression)).toHaveLength(0)
  })
})

describe('maxDepth / maxNodes — per call, from stored counts', () => {
  const deep = { a: { b: { c: { d: { e: { $plus: [1, 2] } } } } } }

  test('limits are compared per call — the artifact stays option-independent', () => {
    expect(fig.validate(deep).valid).toBe(true)
    const limited = fig.validate(deep, { maxDepth: 2 })
    expect(limited.issues.map((issue) => issue.code)).toContain('max-depth')
    expect(fig.validate(deep).valid).toBe(true)
  })

  test('maxNodes', () => {
    const result = fig.validate(deep, { maxNodes: 3 })
    expect(result.issues.map((issue) => issue.code)).toContain('max-nodes')
  })
})

describe('returns feeding-position check', () => {
  test('an empty intersection between returns and the receiving type errors', () => {
    expect(errorCodes({ $clamp: [{ '$>': [1, 2] }] })).toContain('returns-mismatch')
  })

  test('wide returns and any-typed receivers never fire', () => {
    expect(errorCodes({ $not: { $plus: [1, 2] } })).toHaveLength(0)
    expect(errorCodes({ $clamp: [{ $plus: [1, 2] }] })).toHaveLength(0)
  })
})

describe('operator validate hooks', () => {
  test('hook errors carry the operator, parameter and hook severity', () => {
    const issues = issuesOf({ $pattern: ['('] })
    const hookIssue = issues.find((issue) => issue.code === 'operator-validate') as Issue
    expect(hookIssue.severity).toBe('error')
    expect(hookIssue.operator).toBe('pattern')
    expect(hookIssue.parameter).toBe('pattern')
  })

  test('hook warnings and hints pass through', () => {
    expect(warningCodes({ $pattern: ['warn-me'] })).toContain('operator-validate')
    const hints = issuesOf({ $pattern: ['probe-helpers'] }).filter(
      (issue) => issue.severity === 'hint'
    )
    expect(hints).toHaveLength(1)
  })

  test('the helpers toolbox carries the shared primitives (contract Q7)', () => {
    const hint = issuesOf({ $pattern: ['probe-helpers'] }).find(
      (issue) => issue.severity === 'hint'
    )
    for (const helper of ['parsePath', 'checkType', 'checkConstraints', 'renderText']) {
      expect(hint?.message).toContain(helper)
    }
  })

  test('dynamic values are absent from literalParams — runtime never lints', () => {
    expect(issuesOf({ $pattern: ['$data.p'] }).filter((i) => i.code === 'operator-validate')).toHaveLength(0)
  })
})

describe('sample-data check (only when data is supplied)', () => {
  test('warns on statically-known $data paths absent from the sample', () => {
    const expression = { a: '$data.user.name', b: '$data.missing.path' }
    const result = fig.validate(expression, { data: { user: { name: 'Ada' } } })
    const misses = result.issues.filter((issue) => issue.code === 'missing-data-path')
    expect(misses).toHaveLength(1)
    expect(misses[0].severity).toBe('warning')
    expect(misses[0].message).toContain('missing.path')
  })

  test('no data supplied, no check', () => {
    expect(warningCodes({ a: '$data.missing.path' })).toHaveLength(0)
  })
})

describe('useless modifiers on literal', () => {
  test('fallback / vars / useCache on literal warn as dead', () => {
    const result = fig.validate({ $literal: { x: 1 }, fallback: 2, useCache: true })
    const dead = result.issues.filter((issue) => issue.code === 'useless-modifier')
    expect(dead).toHaveLength(2)
    expect(result.valid).toBe(true)
  })
})
