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
  type CatalogOperatorParameter,
  type ExpectedType,
  type FigTreeError,
  type FragmentDefinition,
  type LazyValue,
  type OperatorContext,
  type CategoryOverrides,
  type ListingMap,
  type PerElement,
  type SettlementStream,
} from '../src'
import {
  categoryListings,
  fragmentColors,
  getCatalog,
  operatorListings,
  typeSeeds,
} from '../src/catalog'
import { isDeepStrictEqual } from 'node:util'
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

// A parameter that is valid only beside another one, which the test adds
// with it: a body is legal on a POST only, and `method` defaults to GET
const companions: Record<string, Record<string, Record<string, unknown>>> = {
  http: { body: { method: 'post' } },
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
      const { background, text } = listing.colors!
      expect(background).toMatch(HEX)
      expect(text).toMatch(HEX)
      expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5)
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

    // A literal parameter (an iterator's `as`) renames the bindings the
    // rest of the node reads, so adding one is a rename for the editor to
    // carry through, not a starting value to check in isolation
    const optional = Object.entries(op.parameters).filter(
      ([, declared]) => !declared.required && declared.evaluationMode !== 'literal'
    )
    if (optional.length > 0)
      test.each(optional.map(([parameter]) => parameter))(
        'adding %s to the starting node keeps it valid',
        (parameter) => {
          const node = {
            ...startingNode(operator),
            ...companions[operator.name]?.[parameter],
            [parameter]: operator.parameters[parameter].seed,
          }
          expect(errorsOf(node)).toEqual([])
        }
      )

    const literal = Object.entries(op.parameters).filter(
      ([, declared]) => declared.evaluationMode === 'literal'
    )
    if (literal.length > 0)
      test.each(literal.map(([parameter]) => parameter))(
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
    (_, { colors: { background, text } }) => {
      expect(background).toMatch(HEX)
      expect(text).toMatch(HEX)
      expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5)
    }
  )

  test('fragmentColors: hex, with text at 4.5:1 or better', () => {
    const { background, text } = fragmentColors
    expect(background).toMatch(HEX)
    expect(text).toMatch(HEX)
    expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5)
  })
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
    test('every category in use, in its order, under its name', () => {
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
        const { displayName, description, docUrl, colors, metadata, ...rest } = operator
        void [displayName, description, docUrl, colors, metadata]
        const parameters = Object.fromEntries(
          Object.entries(rest.parameters).map(
            ([
              name,
              { description, seed, sample, nullOutcome, elementNullOutcome, ...parameter },
            ]) => {
              void [description, seed, sample, nullOutcome, elementNullOutcome]
              return [name, parameter]
            }
          )
        )
        // metadata is merged, so it is checked on its own
        const { metadata: own, ...expected } = snapshot[i]
        void own
        expect({ ...rest, parameters }).toStrictEqual(expected)
      })
    })

    test('a package operator takes its listing', () => {
      const plus = catalogOperator('plus')
      const listing = operatorListings.plus
      expect(plus).toMatchObject({
        displayName: listing.displayName,
        description: listing.description,
        docUrl: listing.docUrl,
        colors: listing.colors,
      })
      expect(plus.parameters.values.description).toBe(listing.parameterDescriptions!.values)
      expect(plus.parameters.values.seed).toEqual(listing.seeds!.values)
    })

    test('an operator without a listing falls back on its name, category and types', () => {
      const [operator] = getCatalog(new FigTree({ operators: [tally] })).operators
      expect(operator.displayName).toBe('tally')
      expect(operator.colors).toBe(categoryListings.math.colors)
      for (const key of ['description', 'docUrl']) expect(Object.hasOwn(operator, key)).toBe(false)
      const { values, mode, start } = operator.parameters
      expect(Object.hasOwn(values, 'description')).toBe(false)
      // A plain type's seed, a literal union's first member, and a union's
      // first non-null member's seed
      expect([values.seed, mode.seed, start.seed]).toEqual([typeSeeds.array, 'sum', 1])
    })

    test("a host's listing is joined in, its seeds over the type rule", () => {
      const [operator] = getCatalog(new FigTree({ operators: [tally] }), {
        listings: [
          {
            tally: {
              displayName: 'Tally',
              description: 'Sum or count',
              parameterDescriptions: { mode: 'What to tally' },
              docUrl: 'https://example.com/tally',
              colors: { background: '#123456', text: '#ffffff' },
              seeds: { mode: 'count' },
            },
          },
        ],
      }).operators
      expect(operator).toMatchObject({
        displayName: 'Tally',
        description: 'Sum or count',
        docUrl: 'https://example.com/tally',
        colors: { background: '#123456', text: '#ffffff' },
      })
      expect(operator.parameters.mode).toMatchObject({
        description: 'What to tally',
        seed: 'count',
      })
      expect(operator.parameters.values.seed).toEqual(typeSeeds.array)
    })

    describe('listings merge over the package’s, field by field', () => {
      const instance = new FigTree({ operators: [coreOperators, tally] })
      const operatorOf = (name: string, ...listings: ListingMap[]) =>
        getCatalog(instance, { listings }).operators.find((op) => op.name === name)!
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

      test('colours replace the pair beneath, whole, and fall back on the category', () => {
        const pair = { background: '#123456', text: '#ffffff' }
        expect(operatorOf('plus', { plus: { colors: pair } }).colors).toBe(pair)
        expect(operatorOf('tally', { tally: { colors: pair } }).colors).toBe(pair)
        expect(operatorOf('tally').colors).toBe(categoryListings.math.colors)
        // A later entry without colours keeps the pair beneath
        const restyled = operatorOf(
          'plus',
          { plus: { colors: pair } },
          { plus: { displayName: 'Add' } }
        )
        expect(restyled.colors).toBe(pair)
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
          listings: [{ constructed: { parameterDescriptions: {}, samples: {}, seeds: {} } }],
        }).operators
        const parameter = operator.parameters['constructor' as string]
        expect(Object.hasOwn(parameter, 'description')).toBe(false)
        expect(Object.hasOwn(parameter, 'sample')).toBe(false)
        expect(parameter.seed).toBe(typeSeeds.string)
      })
    })
  })

  describe('nullOutcome', () => {
    test('each rule, in the order the engine meets them', () => {
      const probe = defineOperator({
        name: 'probe',
        category: 'other',
        parameters: {
          mode: { type: { literal: ['keep', 'drop'] }, default: 'keep' },
          count: { type: 'number' },
          places: { type: 'number', default: 1 },
          nullable: { type: ['number', 'null'] },
          kept: { type: ['number', 'null'], nullPolicy: 'value' },
          judged: { type: 'any', truthiness: true },
          chosen: {
            type: 'any',
            nullPolicy: (mode: string) => (mode === 'keep' ? 'value' : 'propagate'),
          },
          branch: { type: 'any', evaluationMode: 'lazy' },
          strictBranch: { type: 'number', evaluationMode: 'lazy', required: false },
          items: { type: 'array', elementNullPolicy: 'propagate' },
          entries: { type: 'object', required: false },
          numbers: { type: 'array', constraints: { homogeneous: ['number'] }, required: false },
          mixed: { type: 'array', constraints: { homogeneous: ['any'] }, required: false },
          rows: {
            type: 'array',
            constraints: { elementShape: { id: { type: 'number' } } },
            required: false,
          },
          each: { type: 'any', evaluationMode: 'perElement', over: 'items' },
          as: { type: 'string', evaluationMode: 'literal', required: false },
          nullValueDefault: {
            type: 'number',
            evaluationMode: 'lazy',
            required: false,
            replacesNullAt: ['items'],
          },
        },
        evaluate: () => null,
      })
      const [operator] = getCatalog(new FigTree({ operators: [probe] })).operators
      const outcomes = Object.fromEntries(
        Object.entries(operator.parameters).map(([name, { nullOutcome }]) => [name, nullOutcome])
      )
      expect(outcomes).toEqual({
        mode: 'unset',
        count: 'error',
        places: 'unset',
        nullable: 'propagate',
        kept: 'value',
        judged: 'value',
        chosen: {
          selector: 'mode',
          table: [
            { value: 'keep', policy: 'value' },
            { value: 'drop', policy: 'propagate' },
          ],
        },
        branch: 'value',
        strictBranch: 'error',
        items: 'error',
        entries: 'unset',
        numbers: 'unset',
        mixed: 'unset',
        rows: 'unset',
        each: 'value',
        as: 'error',
        nullValueDefault: 'none',
      })
      // The placeholder the outcome replaces, for contrast
      expect(operator.parameters.places.nullPolicy).toBe('propagate')
      // Only the containers report their elements', and a constraint a null
      // fails rules a null element out where no policy takes it
      const elementOutcomes = Object.fromEntries(
        Object.entries(operator.parameters)
          .filter(([, parameter]) => Object.hasOwn(parameter, 'elementNullOutcome'))
          .map(([name, { elementNullOutcome }]) => [name, elementNullOutcome])
      )
      expect(elementOutcomes).toEqual({
        items: 'propagate',
        entries: 'value',
        numbers: 'error',
        mixed: 'value',
        rows: 'error',
      })
    })

    // The catalog repeats the engine's rules, so this holds them to it: each
    // package parameter in turn handed a null, by an operator whose body
    // records what it was given in place of its own
    describe('matches what the engine does with a null', () => {
      let underTest = { operator: '', parameter: '', element: false }
      let received: { has: boolean; value: unknown } | undefined
      const recording = packageOperators.map((operator) => ({
        ...operator,
        evaluate: async (params: Record<string, unknown>, context: OperatorContext) => {
          if (operator.name !== underTest.operator) return operator.evaluate(params, context)
          const name = underTest.parameter
          const { evaluationMode } = operator.parameters[name]
          const value = params[name]
          // A handle is demanded here, while the node is still running
          received = {
            has: Object.hasOwn(params, name),
            value: underTest.element
              ? await probedElement(value, evaluationMode)
              : evaluationMode === 'lazy'
                ? await (value as LazyValue).evaluate()
                : evaluationMode === 'perElement'
                  ? await (value as PerElement).evaluate(0)
                  : value,
          }
          return 'ran'
        },
      }))
      // The element a test puts the null in: an array's last, or an object's
      // `probe` value, through whichever delivery the parameter declares
      const probedElement = async (value: unknown, mode: string): Promise<unknown> => {
        switch (mode) {
          case 'lazyElements':
            return (value as LazyValue[]).at(-1)!.evaluate()
          case 'lazyEntries':
            return (value as Record<string, LazyValue>).probe.evaluate()
          case 'race': {
            const stream = value as SettlementStream
            for await (const settlement of stream)
              if (settlement.index === stream.length - 1) {
                if (!settlement.ok) throw settlement.error
                return settlement.value
              }
            throw new Error('the probed element never settled')
          }
          default:
            return Array.isArray(value) ? value.at(-1) : (value as Record<string, unknown>).probe
        }
      }
      // A null from a node rather than a literal, as data would give it
      const nothing = defineOperator({
        name: 'nothing',
        category: 'other',
        parameters: {},
        evaluate: () => null,
      })
      const engine = new FigTree({ operators: [recording, nothing] })

      const observe = async (
        node: Record<string, unknown>,
        parameter: CatalogOperatorParameter
      ) => {
        received = undefined
        try {
          const result = await engine.evaluate(node)
          if (received === undefined) return result === null ? 'propagate' : `gave ${result}`
          const { has, value } = received as { has: boolean; value: unknown }
          // A judged position receives the null as false
          if (value === null || (parameter.truthiness && value === false)) return 'value'
          if (!has || isDeepStrictEqual(value, parameter.default)) return 'unset'
          return `received ${JSON.stringify(value)}`
        } catch (error) {
          const { code, message } = error as FigTreeError
          return code === 'type-check' || code === 'invalid-as'
            ? 'error'
            : `threw ${code}: ${message}`
        }
      }

      const cases = catalog.operators.flatMap((operator) =>
        Object.entries(operator.parameters)
          .filter(([, parameter]) => parameter.replacesNullAt === undefined)
          .map(([name, parameter]) => [`${operator.name}.${name}`, operator, name, parameter])
      ) as [string, CatalogOperator, string, CatalogOperatorParameter][]

      test.each(cases)('%s', async (_, operator, name, parameter) => {
        underTest = { operator: operator.name, parameter: name, element: false }
        // A literal parameter takes only a literal value
        const missing = parameter.evaluationMode === 'literal' ? null : { operator: 'nothing' }
        const node = { ...startingNode(operator), [name]: missing }
        const { nullOutcome } = parameter
        if (typeof nullOutcome === 'string') {
          expect(await observe(node, parameter)).toBe(nullOutcome)
          return
        }
        for (const { value, policy } of nullOutcome.table)
          expect({
            [nullOutcome.selector]: value,
            outcome: await observe({ ...node, [nullOutcome.selector]: value }, parameter),
          }).toEqual({ [nullOutcome.selector]: value, outcome: policy })
      })

      const elementCases = cases.filter(([, , , parameter]) => parameter.elementNullOutcome)

      test('a holder reports no element outcome, even where it takes a list', () => {
        const holders = catalog.operators.flatMap((operator) =>
          Object.values(operator.parameters).filter((parameter) => parameter.replacesNullAt)
        )
        expect(holders.some((holder) => holder.type === 'array')).toBe(true)
        for (const holder of holders)
          expect(Object.hasOwn(holder, 'elementNullOutcome')).toBe(false)
      })

      test.each(elementCases)('%s, a null element', async (_, operator, name, parameter) => {
        underTest = { operator: operator.name, parameter: name, element: true }
        const { seed } = parameter
        const nothing = { operator: 'nothing' }
        // In place of the seed's last element, so a length constraint holds
        const container = [parameter.type].flat().includes('array')
          ? Array.isArray(seed) && seed.length > 0
            ? [...seed.slice(0, -1), nothing]
            : [nothing]
          : { ...(seed as object), probe: nothing }
        const node = { ...startingNode(operator), [name]: container }
        expect(await observe(node, parameter)).toBe(parameter.elementNullOutcome)
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
            name: { type: 'string' },
            punctuation: { type: 'string', default: '!' },
          },
          listing: {
            displayName: 'Greeting',
            description: 'A greeting',
            parameterDescriptions: { name: 'Who to greet' },
            docUrl: 'https://example.com/greeting',
            colors: { background: '#477799', text: '#ffffff' },
            seeds: { name: 'Ada' },
          },
        },
        // Presentation keys in metadata are the host's own, never read
        bare: {
          expression: 1,
          metadata: { displayName: 'Bare', colors: { background: '#477799', text: '#ffffff' } },
        },
      },
    })
    const { fragments } = getCatalog(instance)
    const find = (name: string) => fragments.find((fragment) => fragment.name === name)!

    test('one per registered fragment, carrying every field of the snapshot', () => {
      const snapshot = instance.getFragments()
      expect(fragments.map((fragment) => fragment.name)).toEqual(snapshot.map((f) => f.name))
      fragments.forEach((fragment, i) => {
        const { displayName, description, docUrl, colors, metadata, ...rest } = fragment
        void [displayName, description, docUrl, colors, metadata]
        const parameters = Object.fromEntries(
          Object.entries(rest.parameters).map(
            ([name, { seed, sample, description, ...parameter }]) => {
              void [seed, sample, description]
              return [name, parameter]
            }
          )
        )
        // The raw listing is resolved onto the entry, not carried, and
        // metadata is merged, so it is checked on its own
        const { listing, metadata: own, ...expected } = snapshot[i]
        void [listing, own]
        expect({ ...rest, parameters }).toStrictEqual(expected)
      })
    })

    test("a fragment's listing is its display data and its text", () => {
      const greeting = find('greeting')
      expect(greeting).toMatchObject({
        displayName: 'Greeting',
        description: 'A greeting',
        docUrl: 'https://example.com/greeting',
        colors: { background: '#477799', text: '#ffffff' },
      })
      expect(greeting.parameters.name).toMatchObject({ description: 'Who to greet', seed: 'Ada' })
      // The type rule, not the runtime default
      expect(greeting.parameters.punctuation.seed).toBe(typeSeeds.string)
    })

    test('without a listing: its name, no text, the shared colours, whatever its metadata says', () => {
      const bare = find('bare')
      expect(bare.displayName).toBe('bare')
      expect(bare.colors).toBe(fragmentColors)
      for (const key of ['description', 'docUrl', 'listing'])
        expect(Object.hasOwn(bare, key)).toBe(false)
      expect(bare.metadata).toEqual({
        displayName: 'Bare',
        colors: { background: '#477799', text: '#ffffff' },
      })
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

  describe('categories in use, and their overrides', () => {
    const instance = new FigTree({
      operators: [coreOperators.filter(({ category }) => category === 'math'), tally],
    })

    test('only the categories an operator is in', () => {
      expect(getCatalog(instance).categories.map(({ name }) => name)).toEqual(['math'])
      expect(getCatalog(new FigTree({ operators: [] })).categories).toEqual([])
    })

    test('overrides merge over the package’s, in order, field by field', () => {
      const pair = { background: '#123456', text: '#ffffff' }
      const { categories, operators } = getCatalog(instance, {
        categories: [
          { math: { displayName: 'Maths', colors: pair } },
          { math: { displayName: 'Mathématiques', order: undefined }, logic: { order: 0 } },
        ],
      })
      expect(categories).toEqual([
        {
          name: 'math',
          displayName: 'Mathématiques',
          order: categoryListings.math.order,
          colors: pair,
        },
      ])
      // An operator without colours of its own takes its category's, overridden
      expect(operators.find(({ name }) => name === 'tally')!.colors).toBe(pair)
      expect(categoryListings.math.displayName).toBe('Arithmetic & math')
    })

    test('an overridden order reorders the categories', () => {
      const both = new FigTree({ operators: [coreOperators] })
      const names = (overrides: CategoryOverrides[]) =>
        getCatalog(both, { categories: overrides }).categories.map(({ name }) => name)
      expect(names([]).slice(0, 2)).toEqual(['logic', 'comparison'])
      expect(names([{ comparison: { order: -1 } }]).slice(0, 2)).toEqual(['comparison', 'logic'])
    })

    test('reads only keys an override holds itself', () => {
      const inherited = Object.create({ math: { displayName: 'Inherited' } })
      expect(getCatalog(instance, { categories: [inherited] }).categories[0].displayName).toBe(
        categoryListings.math.displayName
      )
    })
  })

  describe('metadata', () => {
    const bag = { team: 'core', reviewed: false }
    const tagged = defineOperator({
      name: 'tagged',
      category: 'other',
      metadata: bag,
      parameters: {},
      evaluate: () => null,
    })
    const instance = new FigTree({
      operators: [coreOperators, tagged],
      fragments: {
        frag: { expression: 1, metadata: { team: 'frag' }, listing: { metadata: { icon: 'f' } } },
      },
    })

    test("the definition's, with each listing layer's merged over it, key by key", () => {
      const { operators, fragments } = getCatalog(instance, {
        listings: [
          {
            tagged: { metadata: { reviewed: true, icon: 'tag' } },
            frag: { metadata: { team: 'over' } },
          },
          { tagged: { metadata: { icon: 'later', reviewed: undefined } } },
        ],
      })
      expect(operators.find(({ name }) => name === 'tagged')!.metadata).toEqual({
        team: 'core',
        reviewed: true,
        icon: 'later',
      })
      expect(fragments[0].metadata).toEqual({ team: 'over', icon: 'f' })
      // The definition's bag is never written to
      expect(bag).toEqual({ team: 'core', reviewed: false })
      expect(instance.getOperators().find(({ name }) => name === 'tagged')!.metadata).toBe(bag)
    })

    test('{} where nothing gives any', () => {
      expect(catalogOperator('plus').metadata).toEqual({})
      expect(getCatalog(instance).literal.metadata).toEqual({})
    })
  })

  describe('samples', () => {
    test('a parameter takes its sample, merged per parameter across layers', () => {
      const instance = new FigTree({
        operators: [tally],
        fragments: {
          greet: {
            expression: '$params.name',
            parameters: { name: { type: 'string' }, punctuation: { type: 'string', default: '!' } },
            listing: { samples: { name: 'Ada', punctuation: '?' } },
          },
        },
      })
      const { operators, fragments } = getCatalog(instance, {
        listings: [
          { tally: { samples: { values: [1, 2, 3], mode: 'sum' } } },
          { tally: { samples: { mode: 'count' } }, greet: { samples: { name: 'Grace' } } },
        ],
      })
      const { values, mode, start } = operators[0].parameters
      expect([values.sample, mode.sample]).toEqual([[1, 2, 3], 'count'])
      expect(Object.hasOwn(start, 'sample')).toBe(false)
      const { name, punctuation } = fragments[0].parameters
      expect([name.sample, punctuation.sample]).toEqual(['Grace', '?'])
    })
  })

  describe('listing maps reach fragments and literal', () => {
    const instance = new FigTree({
      operators: [coreOperators],
      fragments: {
        greet: {
          expression: '$params.name',
          parameters: { name: { type: 'string' } },
          listing: {
            displayName: 'Greet',
            description: 'A greeting',
            parameterDescriptions: { name: 'Who to greet' },
            seeds: { name: 'Ada' },
          },
        },
      },
    })

    test("a map merges over a fragment's own listing, field by field", () => {
      const pair = { background: '#123456', text: '#ffffff' }
      const [greet] = getCatalog(instance, {
        listings: [
          { greet: { description: 'Une salutation', colors: pair, seeds: { name: 'Zoé' } } },
        ],
      }).fragments
      expect(greet).toMatchObject({
        displayName: 'Greet',
        description: 'Une salutation',
        colors: pair,
      })
      expect(greet.parameters.name).toMatchObject({ description: 'Who to greet', seed: 'Zoé' })
      // The definition's listing is untouched
      expect(instance.getFragments()[0].listing?.description).toBe('A greeting')
    })

    test('literal is listed from the package’s listing, and a map can change it', () => {
      const listing = operatorListings.literal
      expect(catalog.literal).toEqual({
        displayName: listing.displayName,
        docUrl: listing.docUrl,
        colors: listing.colors,
        metadata: {},
        parameters: { value: { seed: listing.seeds!.value } },
      })
      const { literal } = getCatalog(instance, {
        listings: [
          { literal: { displayName: 'Littéral', parameterDescriptions: { value: 'Data' } } },
        ],
      })
      expect(literal.displayName).toBe('Littéral')
      expect(literal.colors).toBe(listing.colors)
      expect(literal.parameters.value).toEqual({ description: 'Data', seed: listing.seeds!.value })
    })

    test('keys are canonical names: an alias, or a name nothing has, is ignored', () => {
      const plus = catalogOperator('plus')
      expect(
        getCatalog(fig, {
          listings: [{ '+': { displayName: 'Add' }, nothing: { displayName: 'X' } }],
        }).operators.find(({ name }) => name === 'plus')
      ).toStrictEqual(plus)
    })
  })
})

describe("a fragment definition's listing and metadata", () => {
  // Type-level: the file fails to compile if a literal is misjudged
  test('the listing is a Listing, text included, and typed by it', () => {
    const listed: FragmentDefinition = {
      expression: 1,
      listing: { displayName: 'One', description: 'The number one', samples: {} },
    }
    const mistyped: FragmentDefinition = {
      expression: 1,
      // @ts-expect-error — a listing field keeps its type
      listing: { displayName: 1 },
    }
    expect([listed, mistyped]).toHaveLength(2)
  })

  test("metadata takes any of a host's own keys", () => {
    const hosted: FragmentDefinition = {
      expression: 1,
      metadata: { displayName: 1, team: 'config-admins' },
    }
    expect(hosted.metadata).toBeDefined()
  })
})
