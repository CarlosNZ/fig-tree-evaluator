/**
 * `./catalog` ("`./catalog`" in docs-dev/v3-specs/v3-packaging.md). The
 * listings are co-versioned with the operators so that drift is caught where
 * it starts; the first half of this file is the tests that catch it. The
 * second half is `getCatalog`, which joins the listings into what an
 * instance reports.
 *
 * The starting-node tests read each parameter's `seed` from `getCatalog`,
 * so they check the seeds the way an editor will actually use them.
 */
import {
  FigTree,
  OPERATOR_CATEGORIES,
  defineOperator,
  coreOperators,
  httpOperators,
  sqlOperators,
  type CatalogOperator,
  type ExpectedType,
  type FragmentDefinition,
  type FragmentMetadata,
  type OperatorListingMap,
} from '../src'
import { categoryListings, getCatalog, operatorListings, typeSeeds } from '../src/catalog'
import { checkConstraints, checkType } from '../src/typeCheck'
import { MockHttpClient, MockSqlConnection } from './helpers'

const packageOperators = [
  ...coreOperators,
  ...httpOperators(new MockHttpClient()),
  ...sqlOperators(new MockSqlConnection()),
]
const fig = new FigTree({ operators: packageOperators })
const catalog = getCatalog(fig)
const catalogOperator = (name: string) => catalog.operators.find((op) => op.name === name)!

/** An operator node holding its required parameters' starting values. */
const startingNode = (operator: CatalogOperator) => {
  const node: Record<string, unknown> = { operator: operator.name }
  for (const [name, parameter] of Object.entries(operator.parameters))
    if (parameter.required) node[name] = parameter.seed
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

describe('operatorListings', () => {
  test('one entry per core and I/O operator, one for literal, and no others', () => {
    expect(Object.keys(operatorListings).sort()).toEqual(
      [...packageOperators.map((op) => op.name), 'literal'].sort()
    )
  })

  test('display names are unique', () => {
    const names = Object.values(operatorListings).map((listing) => listing.displayName)
    expect(new Set(names).size).toBe(names.length)
  })

  describe.each(Object.entries(operatorListings))('%s is listed', (_, listing) => {
    test('with a display name and an https documentation link', () => {
      expect(listing.displayName?.trim()).toBeTruthy()
      expect(new URL(listing.docUrl!).protocol).toBe('https:')
    })

    test('with hex colours, text at 4.5:1 or better', () => {
      expect(listing.backgroundColor).toMatch(HEX)
      expect(listing.textColor).toMatch(HEX)
      expect(contrast(listing.backgroundColor!, listing.textColor!)).toBeGreaterThanOrEqual(4.5)
    })
  })

  // `literal` is grammar, with no definition to check its seeds against:
  // its one parameter, `value`, takes anything and is returned as it is
  test('literal seeds only its value, and its starting node returns the seed', async () => {
    const seeds = operatorListings.literal.seeds ?? {}
    expect(Object.keys(seeds)).toEqual(['value'])
    const node = { operator: 'literal', value: seeds.value }
    expect(errorsOf(node)).toEqual([])
    expect(await fig.evaluate(node)).toEqual(seeds.value)
  })

  describe.each(packageOperators.map((op) => [op.name, op] as const))('%s', (name, op) => {
    const listing = operatorListings[name]
    const operator = catalogOperator(name)

    // An editor shows these as the node's and each parameter row's tooltip
    test('describes the operator and every declared parameter, and no other', () => {
      expect(listing.description?.trim()).toBeTruthy()
      const described = listing.parameterDescriptions ?? {}
      expect(Object.keys(described).sort()).toEqual(Object.keys(op.parameters).sort())
      for (const text of Object.values(described)) expect(text.trim()).not.toBe('')
    })

    test('every seed names a declared parameter and fits its declaration', () => {
      for (const [parameter, seed] of Object.entries(listing.seeds ?? {})) {
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
      expect(errorsOf(startingNode(operator))).toEqual([])
    })

    // A structural parameter (an iterator's `as`) renames the bindings the
    // rest of the node reads, so adding one is a rename for the editor to
    // carry through, not a starting value to check in isolation
    const optional = Object.entries(op.parameters).filter(
      ([, declared]) => !declared.required && declared.evaluation !== 'structural'
    )
    if (optional.length > 0)
      test.each(optional.map(([parameter]) => parameter))(
        'adding %s to the starting node keeps it valid',
        (parameter) => {
          const node = {
            ...startingNode(operator),
            [parameter]: operator.parameters[parameter].seed,
          }
          expect(errorsOf(node)).toEqual([])
        }
      )

    const structural = Object.entries(op.parameters).filter(
      ([, declared]) => declared.evaluation === 'structural'
    )
    if (structural.length > 0)
      test.each(structural.map(([parameter]) => parameter))(
        'adding %s, with its bindings renamed through the node, keeps it valid',
        (parameter) => {
          const binding = operator.parameters[parameter].seed
          const node = { ...startingNode(operator), [parameter]: binding }
          const renamed = JSON.parse(JSON.stringify(node).replaceAll('$element', `$${binding}`))
          expect(errorsOf(renamed)).toEqual([])
        }
      )
  })
})

describe('categoryListings', () => {
  test('one entry per category, and no others', () => {
    expect(Object.keys(categoryListings).sort()).toEqual([...OPERATOR_CATEGORIES].sort())
  })

  test('orders run from 0 with no gaps or repeats', () => {
    const orders = Object.values(categoryListings)
      .map((listing) => listing.order)
      .sort((a, b) => a - b)
    expect(orders).toEqual(OPERATOR_CATEGORIES.map((_, i) => i))
  })

  test.each(Object.entries(categoryListings))(
    '%s: colours are hex, with text at 4.5:1 or better',
    (_, listing) => {
      expect(listing.backgroundColor).toMatch(HEX)
      expect(listing.textColor).toMatch(HEX)
      expect(contrast(listing.backgroundColor, listing.textColor)).toBeGreaterThanOrEqual(4.5)
    }
  )
})

describe('typeSeeds', () => {
  test.each(Object.entries(typeSeeds))('%s: the seed has its own type', (type, seed) => {
    expect(checkType(seed, type as ExpectedType)).toEqual({ ok: true })
  })
})

describe('getCatalog', () => {
  // A host operator with no listing anywhere: every fallback shows on it
  const tally = defineOperator({
    name: 'tally',
    category: 'math',
    parameters: {
      values: { type: 'array' },
      mode: { type: { literal: ['sum', 'count'] }, default: 'sum' },
      start: { type: ['null', 'number'], default: null },
    },
    evaluate: () => 0,
  })

  describe('categories', () => {
    test('every category, in its order, under its name', () => {
      expect(catalog.categories.map((category) => category.name)).toEqual(
        Object.entries(categoryListings)
          .sort(([, a], [, b]) => a.order - b.order)
          .map(([name]) => name)
      )
      expect(catalog.categories[0]).toEqual({ name: 'logic', ...categoryListings.logic })
    })
  })

  describe('operators', () => {
    test('one per registered operator, in registration order', () => {
      expect(catalog.operators.map((op) => op.name)).toEqual(
        fig.getOperators().map((op) => op.name)
      )
    })

    test('carry every field of the snapshot', () => {
      const instance = new FigTree({
        operators: [coreOperators, tally],
        operatorDefaults: { join: { delimiter: ' | ' }, plus: { fallback: 0 } },
      })
      const snapshot = instance.getOperators()
      getCatalog(instance).operators.forEach((operator, i) => {
        const { displayName, description, docUrl, backgroundColor, textColor, ...rest } = operator
        void [displayName, description, docUrl, backgroundColor, textColor]
        const parameters = Object.fromEntries(
          Object.entries(rest.parameters).map(([name, { description, seed, ...parameter }]) => {
            void [description, seed]
            return [name, parameter]
          })
        )
        expect({ ...rest, parameters }).toStrictEqual(snapshot[i])
      })
    })

    test('a package operator takes its listing', () => {
      const plus = catalogOperator('plus')
      const listing = operatorListings.plus
      expect(plus).toMatchObject({
        displayName: listing.displayName,
        description: listing.description,
        docUrl: listing.docUrl,
        backgroundColor: listing.backgroundColor,
        textColor: listing.textColor,
      })
      expect(plus.parameters.values.description).toBe(listing.parameterDescriptions!.values)
      expect(plus.parameters.values.seed).toEqual(listing.seeds!.values)
    })

    test('an operator without a listing falls back on its name, category and types', () => {
      const [operator] = getCatalog(new FigTree({ operators: [tally] })).operators
      expect(operator.displayName).toBe('tally')
      expect(operator.backgroundColor).toBe(categoryListings.math.backgroundColor)
      expect(operator.textColor).toBe(categoryListings.math.textColor)
      for (const key of ['description', 'docUrl']) expect(Object.hasOwn(operator, key)).toBe(false)
      const { values, mode, start } = operator.parameters
      expect(Object.hasOwn(values, 'description')).toBe(false)
      // A plain type's seed, a literal union's first member, and a union's
      // first non-null member's seed
      expect([values.seed, mode.seed, start.seed]).toEqual([typeSeeds.array, 'sum', 1])
    })

    test("a host's listing is joined in, its seeds over the type rule", () => {
      const [operator] = getCatalog(new FigTree({ operators: [tally] }), {
        tally: {
          displayName: 'Tally',
          description: 'Sum or count',
          parameterDescriptions: { mode: 'What to tally' },
          docUrl: 'https://example.com/tally',
          backgroundColor: '#123456',
          textColor: '#ffffff',
          seeds: { mode: 'count' },
        },
      }).operators
      expect(operator).toMatchObject({
        displayName: 'Tally',
        description: 'Sum or count',
        docUrl: 'https://example.com/tally',
        backgroundColor: '#123456',
        textColor: '#ffffff',
      })
      expect(operator.parameters.mode).toMatchObject({
        description: 'What to tally',
        seed: 'count',
      })
      expect(operator.parameters.values.seed).toEqual(typeSeeds.array)
    })

    describe('listings merge over the package’s, field by field', () => {
      const instance = new FigTree({ operators: [coreOperators, tally] })
      const operatorOf = (name: string, ...listings: OperatorListingMap[]) =>
        getCatalog(instance, ...listings).operators.find((op) => op.name === name)!
      const plus = operatorOf('plus')

      test('an entry changing one field keeps every other', () => {
        const renamed = operatorOf('plus', { plus: { displayName: 'Add' } })
        expect(renamed.displayName).toBe('Add')
        expect({ ...renamed, displayName: plus.displayName }).toStrictEqual(plus)
        // Operators the map has no entry for keep their own
        expect(operatorOf('subtract', { plus: { displayName: 'Add' } })).toStrictEqual(
          operatorOf('subtract')
        )
      })

      test('a later map wins over an earlier one, field by field', () => {
        const operator = operatorOf(
          'tally',
          { tally: { displayName: 'First', description: 'Kept' } },
          { tally: { displayName: 'Second' } },
          { tally: { docUrl: 'https://example.com/tally' } }
        )
        expect(operator).toMatchObject({
          displayName: 'Second',
          description: 'Kept',
          docUrl: 'https://example.com/tally',
        })
      })

      test('seeds and parameter descriptions merge per parameter, across maps', () => {
        const operator = operatorOf(
          'tally',
          {
            tally: {
              seeds: { mode: 'count', start: 5 },
              parameterDescriptions: { values: 'What to tally', mode: 'How' },
            },
          },
          { tally: { seeds: { start: 10 }, parameterDescriptions: { mode: 'Sum or count' } } }
        )
        const { values, mode, start } = operator.parameters
        expect([values.seed, mode.seed, start.seed]).toEqual([typeSeeds.array, 'count', 10])
        expect([values.description, mode.description]).toEqual(['What to tally', 'Sum or count'])
        expect(Object.hasOwn(start, 'description')).toBe(false)

        // Over the package's own: one seed changed, the others kept, and the
        // package's listing untouched
        const untouched = operatorOf('buildString')
        const { parameters } = operatorOf('buildString', {
          buildString: { seeds: { trim: true }, parameterDescriptions: { trim: 'Tidy up' } },
        })
        const listing = operatorListings.buildString
        expect(parameters.trim).toMatchObject({ seed: true, description: 'Tidy up' })
        expect(parameters.template).toMatchObject({
          seed: listing.seeds!.template,
          description: listing.parameterDescriptions!.template,
        })
        expect(operatorOf('buildString')).toStrictEqual(untouched)
      })

      test('a field or parameter entry set to undefined erases nothing', () => {
        const operator = operatorOf('plus', {
          plus: {
            displayName: undefined,
            description: undefined,
            docUrl: undefined,
            seeds: { values: undefined },
            parameterDescriptions: { values: undefined } as unknown as Record<string, string>,
          },
        })
        expect(operator).toStrictEqual(plus)
      })

      test('colours apply only as a pair, replacing the pair beneath', () => {
        const half = operatorOf('plus', { plus: { backgroundColor: '#123456' } })
        expect([half.backgroundColor, half.textColor]).toEqual([
          plus.backgroundColor,
          plus.textColor,
        ])
        const halfOverCategory = operatorOf('tally', { tally: { textColor: '#000000' } })
        expect([halfOverCategory.backgroundColor, halfOverCategory.textColor]).toEqual([
          categoryListings.math.backgroundColor,
          categoryListings.math.textColor,
        ])
        // A pair replaces the package's, and a later half changes neither
        const restyled = operatorOf(
          'plus',
          { plus: { backgroundColor: '#123456', textColor: '#ffffff' } },
          { plus: { backgroundColor: '#abcdef' } }
        )
        expect([restyled.backgroundColor, restyled.textColor]).toEqual(['#123456', '#ffffff'])
      })

      test('reads only keys a map or entry holds itself, never inherited ones', () => {
        const inherited = Object.create({ plus: { displayName: 'Inherited' } })
        expect(operatorOf('plus', inherited).displayName).toBe(plus.displayName)

        const constructed = defineOperator({
          name: 'constructed',
          category: 'other',
          parameters: { constructor: { type: 'string' } },
          evaluate: () => null,
        })
        const [operator] = getCatalog(new FigTree({ operators: [constructed] }), {
          constructed: { parameterDescriptions: {}, seeds: {} },
        }).operators
        const parameter = operator.parameters['constructor' as string]
        expect(Object.hasOwn(parameter, 'description')).toBe(false)
        expect(parameter.seed).toBe(typeSeeds.string)
      })
    })
  })

  describe('fragments', () => {
    const instance = new FigTree({
      operators: [coreOperators],
      fragments: {
        greeting: {
          expression: { $buildString: ['Hello, %1', '$params.name'] },
          parameters: {
            name: { type: 'string', description: 'Who to greet' },
            punctuation: { type: 'string', default: '!' },
          },
          description: 'A greeting',
          metadata: {
            displayName: 'Greeting',
            docUrl: 'https://example.com/greeting',
            backgroundColor: '#477799',
            textColor: '#ffffff',
            seeds: { name: 'Ada' },
          } satisfies FragmentMetadata,
        },
        bare: { expression: 1, metadata: { backgroundColor: '#477799' } },
      },
    })
    const { fragments } = getCatalog(instance)
    const find = (name: string) => fragments.find((fragment) => fragment.name === name)!

    test('one per registered fragment, carrying every field of the snapshot', () => {
      const snapshot = instance.getFragments()
      expect(fragments.map((fragment) => fragment.name)).toEqual(snapshot.map((f) => f.name))
      fragments.forEach((fragment, i) => {
        const { displayName, docUrl, backgroundColor, textColor, ...rest } = fragment
        void [displayName, docUrl, backgroundColor, textColor]
        const parameters = Object.fromEntries(
          Object.entries(rest.parameters).map(([name, { seed, ...parameter }]) => {
            void seed
            return [name, parameter]
          })
        )
        expect({ ...rest, parameters }).toStrictEqual(snapshot[i])
      })
    })

    test("a fragment's metadata is its display data, its text its definition's", () => {
      const greeting = find('greeting')
      expect(greeting).toMatchObject({
        displayName: 'Greeting',
        description: 'A greeting',
        docUrl: 'https://example.com/greeting',
        backgroundColor: '#477799',
        textColor: '#ffffff',
      })
      expect(greeting.parameters.name).toMatchObject({ description: 'Who to greet', seed: 'Ada' })
      // The type rule, not the runtime default
      expect(greeting.parameters.punctuation.seed).toBe(typeSeeds.string)
    })

    test('without display metadata: its name, and no colours, not even half a pair', () => {
      const bare = find('bare')
      expect(bare.displayName).toBe('bare')
      for (const key of ['docUrl', 'backgroundColor', 'textColor'])
        expect(Object.hasOwn(bare, key)).toBe(false)
    })
  })

  test('takes anything with the two snapshot methods', () => {
    const { operators, fragments } = getCatalog({
      getOperators: () => fig.getOperators().slice(0, 1),
      getFragments: () => [],
    })
    expect(operators.map((op) => op.name)).toEqual([fig.getOperators()[0].name])
    expect(fragments).toEqual([])
  })
})

describe('FragmentMetadata', () => {
  // Type-level: the file fails to compile if a literal is misjudged
  test('a fragment may give a docUrl or leave it out, and gives no text', () => {
    const withoutDocs: FragmentMetadata = {
      displayName: 'Greeting',
      backgroundColor: '#477799',
      textColor: '#ffffff',
    }
    const withDocs: FragmentMetadata = { ...withoutDocs, docUrl: 'https://example.com/greeting' }
    // @ts-expect-error — a fragment's description is its definition's own
    const described: FragmentMetadata = { description: 'A greeting' }
    expect([withDocs, described]).toHaveLength(2)
  })

  test("a definition's metadata is typed by it, and takes a host's own keys", () => {
    const hosted: FragmentDefinition = {
      expression: 1,
      metadata: { displayName: 'One', seeds: {}, team: 'config-admins' },
    }
    const mistyped: FragmentDefinition = {
      expression: 1,
      // @ts-expect-error — a display key keeps its type beside a host's
      metadata: { displayName: 1 },
    }
    expect([hosted, mistyped]).toHaveLength(2)
  })
})
