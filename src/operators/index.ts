/**
 * The core operators ("The canonical list" in docs-dev/v3-specs/v3-api.md),
 * in canonical-list order: logic & control, comparison, arithmetic & math,
 * string, arrays & iteration, data & objects, special. The eager set ships
 * in Phase 4.2; each later phase splices its group into its slot. `literal`
 * is grammar, not a definition (its name is reserved), so it never appears
 * here.
 */
import { buildOperator } from '../buildOperator'
import type { OperatorDefinition, ValidatedOperatorDefinition } from '../operatorDefinition'
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
import { buildString, join, lower, upper, trim, split, regex } from './string'
import { length, map, filter, find, some, every } from './array'
import { get, buildObject } from './data'
import { convert } from './convert'
import { and, or, not, ifOperator, match, firstOf } from './logic'

/**
 * The core definitions as authored. `buildOperator` builds them without
 * `defineOperator()`'s checks, so these literals are what the checks run
 * over instead: test/package-definitions.test.ts and
 * codegen/checkDefinitions.ts.
 */
export const coreDefinitions: OperatorDefinition[] = [
  // Logic & control
  and,
  or,
  not,
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
  // String
  buildString,
  split,
  join,
  lower,
  upper,
  trim,
  regex,
  // Arrays & iteration
  length,
  map,
  filter,
  find,
  some,
  every,
  // Data & objects
  get,
  buildObject,
  // Special
  convert,
]

export const coreOperators: ValidatedOperatorDefinition[] = coreDefinitions.map(buildOperator)
