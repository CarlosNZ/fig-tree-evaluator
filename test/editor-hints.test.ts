/**
 * Phase 14.2 — `./editor-hints` ("`./editor-hints`" in
 * docs-dev/v3-specs/v3-packaging.md). The module is co-versioned with the
 * operators so that drift is caught where it starts; these are the tests
 * that catch it.
 *
 * `startingValue` below is the reference implementation of the rule an
 * editor follows (documented on `OperatorHints.seeds`), so the starting-node
 * tests check the seeds the way an editor will actually use them.
 */
import {
  FigTree,
  OPERATOR_CATEGORIES,
  coreOperators,
  httpOperators,
  sqlOperators,
  type ExpectedType,
  type FragmentHints,
  type ValidatedParameter,
} from '../src'
import { categoryHints, operatorHints, typeSeeds } from '../src/editor-hints'
import { checkConstraints, checkType } from '../src/typeCheck'
import { MockHttpClient, MockSqlConnection } from './helpers'

const packageOperators = [
  ...coreOperators,
  ...httpOperators(new MockHttpClient()),
  ...sqlOperators(new MockSqlConnection()),
]
const fig = new FigTree({ operators: packageOperators })

/** The type seed for a declared type, per the rule on `OperatorHints.seeds`. */
const typeSeed = (type: ExpectedType): unknown => {
  if (typeof type === 'string') return typeSeeds[type]
  if ('literal' in type) return type.literal[0]
  return typeSeeds[type.find((member) => member !== 'null') ?? 'null']
}

const startingValue = (operator: string, parameter: string, declared: ValidatedParameter) => {
  const seeds = operatorHints[operator].seeds ?? {}
  return parameter in seeds ? seeds[parameter] : typeSeed(declared.type)
}

/** An operator node holding its required parameters' starting values. */
const startingNode = (operator: string, parameters: Record<string, ValidatedParameter>) => {
  const node: Record<string, unknown> = { operator }
  for (const [name, declared] of Object.entries(parameters))
    if (declared.required) node[name] = startingValue(operator, name, declared)
  return node
}

const errorsOf = (expression: unknown) =>
  fig.validate(expression).issues.filter((issue) => issue.severity === 'error')

/** WCAG relative luminance of a `#rrggbb` colour. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

const HEX = /^#[0-9a-f]{6}$/

describe('operatorHints', () => {
  test('one entry per core and I/O operator, and no others', () => {
    expect(Object.keys(operatorHints).sort()).toEqual(packageOperators.map((op) => op.name).sort())
  })

  test('display names are unique', () => {
    const names = Object.values(operatorHints).map((hints) => hints.displayName)
    expect(new Set(names).size).toBe(names.length)
  })

  describe.each(packageOperators.map((op) => [op.name, op] as const))('%s', (name, op) => {
    const hints = operatorHints[name]

    test('the documentation link is an https URL', () => {
      expect(new URL(hints.docUrl).protocol).toBe('https:')
    })

    test('colours are hex, with text at 4.5:1 or better', () => {
      expect(hints.backgroundColor).toMatch(HEX)
      expect(hints.textColor).toMatch(HEX)
      expect(contrast(hints.backgroundColor, hints.textColor)).toBeGreaterThanOrEqual(4.5)
    })

    test('every seed names a declared parameter and fits its declaration', () => {
      for (const [parameter, seed] of Object.entries(hints.seeds ?? {})) {
        const declared = op.parameters[parameter]
        expect({ parameter, declared: declared !== undefined }).toEqual({
          parameter,
          declared: true,
        })
        expect(checkType(seed, declared.type)).toEqual({ ok: true })
        if (declared.constraints !== undefined)
          expect(checkConstraints(seed, declared.constraints)).toEqual({ ok: true })
      }
    })

    test('the starting node validates without errors', () => {
      expect(errorsOf(startingNode(name, op.parameters))).toEqual([])
    })

    // A structural parameter (an iterator's `as`) renames the bindings the
    // rest of the node reads, so adding one is a rename for the editor to
    // carry through, not a starting value to check in isolation
    const optional = Object.entries(op.parameters).filter(
      ([, declared]) => !declared.required && declared.evaluation !== 'structural'
    )
    if (optional.length > 0)
      test.each(optional)(
        'adding %s to the starting node keeps it valid',
        (parameter, declared) => {
          const node = {
            ...startingNode(name, op.parameters),
            [parameter]: startingValue(name, parameter, declared),
          }
          expect(errorsOf(node)).toEqual([])
        }
      )

    const structural = Object.entries(op.parameters).filter(
      ([, declared]) => declared.evaluation === 'structural'
    )
    if (structural.length > 0)
      test.each(structural)(
        'adding %s, with its bindings renamed through the node, keeps it valid',
        (parameter, declared) => {
          const binding = startingValue(name, parameter, declared)
          const node = { ...startingNode(name, op.parameters), [parameter]: binding }
          const renamed = JSON.parse(JSON.stringify(node).replaceAll('$element', `$${binding}`))
          expect(errorsOf(renamed)).toEqual([])
        }
      )
  })
})

describe('categoryHints', () => {
  test('one entry per category, and no others', () => {
    expect(Object.keys(categoryHints).sort()).toEqual([...OPERATOR_CATEGORIES].sort())
  })

  test('orders run from 0 with no gaps or repeats', () => {
    const orders = Object.values(categoryHints)
      .map((hints) => hints.order)
      .sort((a, b) => a - b)
    expect(orders).toEqual(OPERATOR_CATEGORIES.map((_, i) => i))
  })

  test.each(Object.entries(categoryHints))(
    '%s: colours are hex, with text at 4.5:1 or better',
    (_, hints) => {
      expect(hints.backgroundColor).toMatch(HEX)
      expect(hints.textColor).toMatch(HEX)
      expect(contrast(hints.backgroundColor, hints.textColor)).toBeGreaterThanOrEqual(4.5)
    }
  )
})

describe('typeSeeds', () => {
  test.each(Object.entries(typeSeeds))('%s: the seed has its own type', (type, seed) => {
    expect(checkType(seed, type as ExpectedType)).toEqual({ ok: true })
  })
})

describe('FragmentHints', () => {
  // Type-level: the file fails to compile if either literal is rejected
  test('a fragment may give a docUrl or leave it out', () => {
    const withoutDocs: FragmentHints = {
      displayName: 'Greeting',
      backgroundColor: '#477799',
      textColor: '#ffffff',
    }
    const withDocs: FragmentHints = { ...withoutDocs, docUrl: 'https://example.com/greeting' }
    expect(withDocs).toEqual({ ...withoutDocs, docUrl: 'https://example.com/greeting' })
  })
})
