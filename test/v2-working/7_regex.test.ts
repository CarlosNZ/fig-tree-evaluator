/**
 * MIGRATION STATUS (Phase 7.2, 2026-09-19): hand-migrated to
 * test/operators-regex.test.ts. Divergences: the aliases REGEX /
 * pattern-match / regexp / matchPattern die; `testString` (aliases
 * `string` / `value`) becomes `value`, `pattern`'s aliases die; both
 * cases convert by pure rename, since v2's no-flags boolean test is
 * exactly `mode: 'test'` + `flags: ''`. Everything else in the v3 suite
 * is new: `mode: 'extract'` / `'match'`, `flags` and the g/y ban,
 * `noMatchDefault`, and the literal-pattern compile at validate().
 */
import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator()

// REGEX
test('Testing Regex - Email validation', () => {
  const expression = {
    operator: 'REGEX',
    children: ['info@somwhere.net', '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$'],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe(true)
  })
})

test('Testing Regex - Email validation false, using properties', () => {
  const expression = {
    operator: 'pattern-match',
    pattern: '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$',
    testString: 'info@wherever$net',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(false)
  })
})
