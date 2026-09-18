/**
 * MIGRATION STATUS (Phase 4.2, 2026-09-18): hand-migrated to test/operators-string.test.ts.
 * Divergences: aliases arraySplit/SPLIT, `string`/`separator`/`trimWhiteSpace`
 * spellings die (`value`/`delimiter`/`trim`); `excludeTrailing` dies — a
 * trailing delimiter keeps its empty piece; the `pass` + `outputType` delimiter
 * case is respelled with a literal delimiter.
 */
import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator()

// SPLIT

test('Split string by comma', () => {
  const expression = {
    operator: 'split',
    children: ['Alpha, Beta, Gamma, Delta', ','],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual(['Alpha', 'Beta', 'Gamma', 'Delta'])
  })
})

test('Default delimiter (space) with trailing space', () => {
  const expression = {
    operator: 'arraySplit',
    children: ['no need to specify delimiter '],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['no', 'need', 'to', 'specify', 'delimiter'])
  })
})

test("Don't trim whitespace", () => {
  const expression = {
    operator: 'SPLIT',
    value: 'A simple, comma-seperated, list',
    delimiter: ',',
    trimWhiteSpace: false,
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['A simple', ' comma-seperated', ' list'])
  })
})

test('Complex delimiter, with some extraneous whitespace', () => {
  const expression = {
    operator: 'split',
    string: { operator: '+', values: ['One ', '  BREAK ', ' Two ', 'BREAK', 'Three  ', 'BREAK'] },
    separator: { operator: 'pass', value: ['BREAK'], outputType: 'string' },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['One', 'Two', 'Three'])
  })
})
