/**
 * The core operators ("The canonical list" in docs-dev/v3-specs/v3-api.md),
 * in canonical-list order: logic & control, comparison, arithmetic & math,
 * string, arrays & iteration, data & objects, special. The eager set ships
 * in Phase 4.2; each later phase splices its group into its slot. `literal`
 * is grammar, not a definition (its name is reserved), so it never appears
 * here.
 */
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import {
  equal,
  notEqual,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
} from './comparison'
import {
  plus,
  subtract,
  multiply,
  divide,
  modulo,
  power,
  round,
  floor,
  ceil,
  abs,
  min,
  max,
} from './math'
import { lower, upper, trim, split } from './string'
import { length } from './array'
import { convert } from './convert'
import { ifOperator, match, firstOf } from './logic'

export const coreOperators: ValidatedOperatorDefinition[] = [
  // Logic & control — and / or / not arrive with the race delivery, 5.3
  ifOperator,
  match,
  firstOf,
  // Comparison
  equal,
  notEqual,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  // Arithmetic & math
  plus,
  subtract,
  multiply,
  divide,
  modulo,
  power,
  round,
  floor,
  ceil,
  abs,
  min,
  max,
  // String — buildString, join, regex arrive Phase 7.2
  split,
  lower,
  upper,
  trim,
  // Arrays & iteration — the iterators arrive Phase 6
  length,
  // Data & objects — Phase 7.1
  // Special
  convert,
]
