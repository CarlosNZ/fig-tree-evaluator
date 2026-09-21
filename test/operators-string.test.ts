/**
 * Chunk 4.2 — batch 4, the eager value operators: `lower`, `upper`,
 * `trim`, `split`. Hand-migrated from test/v2-working/11_split.test.ts plus
 * the pass's rulings: strict strings in, kept empties, code-point
 * splitting, the shared trim set.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})

describe('split', () => {
  test.each([
    [
      'by comma, trimmed by default',
      { $split: ['Alpha, Beta, Gamma, Delta', ','] },
      ['Alpha', 'Beta', 'Gamma', 'Delta'],
    ],
    [
      'default delimiter is a space',
      { $split: 'no need to specify delimiter' },
      ['no', 'need', 'to', 'specify', 'delimiter'],
    ],
    [
      'trailing delimiter keeps its empty piece',
      { $split: 'trailing space ' },
      ['trailing', 'space', ''],
    ],
    [
      'trim: false keeps the whitespace',
      { operator: 'split', value: 'A simple, comma-seperated, list', delimiter: ',', trim: false },
      ['A simple', ' comma-seperated', ' list'],
    ],
    [
      'complex delimiter with extraneous whitespace',
      { $split: [{ $plus: ['One ', ' BREAK ', ' Two ', 'BREAK', 'Three '] }, 'BREAK'] },
      ['One', 'Two', 'Three'],
    ],
    ['empty input string is one empty field', { $split: ['', ','] }, ['']],
    ['adjacent delimiters keep empties (CSV fields)', { $split: ['a,,b', ','] }, ['a', '', 'b']],
    [
      'empty delimiter splits into code points, never tearing a pair',
      { $split: ['a😀b', ''] },
      ['a', '😀', 'b'],
    ],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toEqual(expected)
  })

  test('null propagates; a non-string is a type error', async () => {
    expect(await ev({ $split: '$data.missing' })).toBe(null)
    const error = await rejection<FigTreeError>(ev({ $split: '$data.n' }, { n: 42 }))
    expect(error.code).toBe('type-check')
  })

  test('trim is named-face only', () => {
    expect(fig.validate({ $split: ['a b', ' ', false] }).issues.map((i) => i.code)).toContain(
      'positional-arity'
    )
  })
})

describe('lower / upper / trim', () => {
  test.each([
    ['lower', { $lower: 'Hello WORLD' }, 'hello world'],
    ['upper', { $upper: 'Hello world' }, 'HELLO WORLD'],
    ['upper can change length (ß → SS)', { $upper: 'straße' }, 'STRASSE'],
    ['lower is locale-independent (dotted I)', { $lower: 'I' }, 'i'],
    ['trim both ends', { $trim: '  padded \n' }, 'padded'],
    ['trim, Unicode whitespace', { $trim: ' nbsp ' }, 'nbsp'],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('strict strings in: a number is a type error, not "42"', async () => {
    const error = await rejection<FigTreeError>(ev({ $lower: '$data.n' }, { n: 42 }))
    expect(error.code).toBe('type-check')
    expect(fig.validate({ $upper: 42 }).valid).toBe(false)
  })

  test('null propagates and composes downstream', async () => {
    expect(await ev({ $lower: '$data.nickname' }, {})).toBe(null)
    expect(await ev({ $equal: [{ $lower: '$data.nickname' }, null] }, {})).toBe(true)
  })
})
