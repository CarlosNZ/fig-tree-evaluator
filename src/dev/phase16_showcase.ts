/**
 * Phase 16 showcase — `pnpm dev phase16_showcase`. The format utilities
 * (docs-dev/v3-specs/v3-format.md): expressions through `toShorthand`,
 * `toCanonical`, `toReference` and `toGet`, each printed with its
 * conversion, and a few evaluated both ways round to show the meaning is
 * kept. Every phase closes with one of these (implementation-plan working
 * rule 7).
 */
import { FigTree, isFigTreeError } from '../index'
import type { CanonicalOptions, ShorthandOptions } from '../index'
import { toCanonical, toGet, toReference, toShorthand } from '../format'
import { migrateV2Expression } from '../migrate'
import { block, print, section } from './showcase'

const fig = new FigTree({
  fragments: {
    greet: {
      expression: { $buildString: ['Hello, %1', '$params.name'] },
      parameters: { name: { type: 'string' } },
    },
  },
})
const data = { user: { name: 'Ada', score: 7 }, items: [{ name: 'pen' }, { name: 'ink' }] }

const short = (expression: unknown, options?: ShorthandOptions) =>
  `→ ${block(toShorthand(expression, fig, options))}`
const full = (expression: unknown, options?: CanonicalOptions) =>
  `→ ${block(toCanonical(expression, fig, options))}`

/** A conversion, then both sides evaluated: the answers must agree. */
const both = async (label: string, expression: unknown, converted: unknown) => {
  const [before, after] = [
    await fig.evaluate(expression, { data }),
    await fig.evaluate(converted, { data }),
  ]
  print(label, expression, `→ ${block(converted)}`)
  console.log(`    evaluates to ${block(before)} both ways: ${block(before) === block(after)}\n`)
}

const note = (text: string) => console.log(`${text.replace(/^/gm, '  ')}\n`)

const main = async () => {
  section('Toward shorthand: the positional form wherever it reads the same')
  print(
    'an array of values',
    { operator: 'plus', values: [1, 2] },
    short({ operator: 'plus', values: [1, 2] })
  )
  print(
    'one value, collapsed',
    { operator: 'not', value: true },
    short({ operator: 'not', value: true })
  )
  print(
    'a prefix of the positions',
    { operator: 'if', condition: '$d.flag', then: 'yes' },
    short({ operator: 'if', condition: '$d.flag', then: 'yes' })
  )
  print(
    'a gap: named, since null is not "left out"',
    { operator: 'if', condition: '$d.flag', else: 'no' },
    short({ operator: 'if', condition: '$d.flag', else: 'no' })
  )
  print(
    'an empty rest is kept, so no collapse',
    { operator: 'buildString', template: 'plain', substitutions: [] },
    short({ operator: 'buildString', template: 'plain', substitutions: [] })
  )
  print(
    'a computed rest is the payload itself',
    { operator: 'min', values: '$d.scores' },
    short({ operator: 'min', values: '$d.scores' })
  )
  print(
    'a parameter with no position: named',
    { operator: 'plus', values: [1], expect: 'number' },
    short({ operator: 'plus', values: [1], expect: 'number' })
  )
  print(
    "arguments: 'named'",
    { operator: 'plus', values: [1, 2] },
    short({ operator: 'plus', values: [1, 2] }, { arguments: 'named' })
  )

  section('Toward full nodes: parameters by name, nothing filled in')
  print(
    'a positional payload',
    { $if: ['$d.flag', 'yes', 'no'] },
    full({ $if: ['$d.flag', 'yes', 'no'] })
  )
  print('an empty rest binds', { $buildString: ['plain'] }, full({ $buildString: ['plain'] }))
  print(
    'the invocation keeps its place among the modifiers',
    { fallback: 0, $subtract: [5, 2], useCache: false },
    full({ fallback: 0, $subtract: [5, 2], useCache: false })
  )
  print('a fragment call', { $greet: { name: 'Ada' } }, full({ $greet: { name: 'Ada' } }))
  print(
    "a literal's content is data, never converted",
    { $literal: { $plus: [1, 2] } },
    full({ $literal: { $plus: [1, 2] } })
  )

  section('Reads: get nodes and references')
  for (const node of [
    { operator: 'get', path: 'user.name' },
    { $get: ['items[0].name'] },
    { operator: 'get', path: 'a', from: '$vars.row' },
    { operator: 'get', path: 'a', fallback: 'none' },
    { operator: 'get', path: { $plus: ['a', 'b'] } },
    { $get: '$field' },
  ])
    print('toReference', node, `→ ${block(toReference(node))}`)
  for (const reference of ['$d.user.name', '$vars.row.a', '$e.name', '$data', '$index'])
    print('toGet', reference, `→ ${block(toGet(reference))}`)
  note(
    'null is the answer "no such form": a modifier or default a string can\'t carry,\na computed path, a $-prefixed path (it may be an `as` binding), or nothing to drill.'
  )
  await both(
    'inside a tree, toShorthand turns reads into references',
    { operator: 'plus', values: [{ operator: 'get', path: 'user.score' }, 1] },
    toShorthand({ operator: 'plus', values: [{ operator: 'get', path: 'user.score' }, 1] }, fig)
  )
  print(
    'and "To full node" on a reference gives a get node',
    '$d.user.name',
    full('$d.user.name', { referencesAsGet: true })
  )

  section('Spellings: form, not names, unless asked')
  print(
    'preserve (the default)',
    { operator: '+', values: ['$data.a'] },
    short({ operator: '+', values: ['$data.a'] })
  )
  print(
    'canonical names',
    { operator: '+', values: ['$d.a'] },
    short(
      { operator: '+', values: ['$d.a'] },
      { operatorNames: 'canonical', referenceNames: 'canonical' }
    )
  )
  print(
    'aliases',
    { operator: 'plus', values: ['$data.a'] },
    short(
      { operator: 'plus', values: ['$data.a'] },
      { operatorNames: 'alias', referenceNames: 'alias' }
    )
  )

  section('Comments: kept where the form has room')
  print(
    "a payload's comment moves to the node when the payload goes positional",
    { $abs: { '//': 'why', value: -1 } },
    short({ $abs: { '//': 'why', value: -1 } })
  )
  print(
    'two comments become one flat array',
    { '//': 'node', $abs: { '//': 'payload', value: -1 } },
    full({ '//': 'node', $abs: { '//': 'payload', value: -1 } })
  )
  print(
    'a get becoming a reference is the one place a comment is lost',
    { '//': 'why', operator: 'get', path: 'user.name' },
    short({ '//': 'why', operator: 'get', path: 'user.name' })
  )

  section("The editor's workflow: build in full, collapse what you like")
  const built = {
    title: { operator: 'upper', value: { operator: 'get', path: 'user.name' } },
    names: {
      operator: 'map',
      input: { operator: 'get', path: 'items' },
      each: { operator: 'upper', value: '$e.name' },
    },
  }
  await both('the whole tree to shorthand', built, toShorthand(built, fig))
  await both(
    'back to full nodes',
    toShorthand(built, fig),
    toCanonical(toShorthand(built, fig), fig)
  )

  section("The converter's output, given a shorthand face")
  const v2 = {
    operator: 'CONDITIONAL',
    condition: {
      operator: '>',
      values: [{ operator: 'objectProperties', property: 'user.score' }, 5],
    },
    valueIfTrue: {
      operator: 'stringSubstitution',
      string: 'Well done, %1',
      substitutions: [{ operator: 'objectProperties', property: 'user.name' }],
    },
    valueIfFalse: 'Keep going',
  }
  const migrated = migrateV2Expression(v2).expression
  print('v2, as migrateV2Expression gives it', v2, `→ ${block(migrated)}`)
  await both('then toShorthand', migrated, toShorthand(migrated, fig))

  section('What stops a conversion, and what does not')
  for (const expression of [
    { operator: 'flibble', values: [1] },
    { fragment: 'nope' },
    { $plus: [1], $abs: 1 },
    { $not: [1, 2] },
    { a: [{ $abs: { value: 1, fallback: 0 } }] },
  ]) {
    try {
      toShorthand(expression, fig)
      print('converts', expression, '→ (no error)')
    } catch (error) {
      if (!isFigTreeError(error)) throw error
      print(
        'throws',
        expression,
        `✗ ${error.code} at ${JSON.stringify(error.path)}: ${error.message}`
      )
    }
  }
  print(
    'a type error, a missing parameter, an out-of-scope read: none touch the form',
    { operator: 'if', condition: { $plus: 'x' }, then: '$vars.later' },
    short({ operator: 'if', condition: { $plus: 'x' }, then: '$vars.later' })
  )
}

main()
