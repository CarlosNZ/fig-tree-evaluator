/**
 * The validate-hook `helpers` toolbox — contract open Q7, settled here at
 * Phase-3 implementation ("Registration & validation" in
 * docs-dev/v3-specs/v3-operator-contract.md: "at minimum the shared
 * primitives"). One frozen object, passed to every hook invocation: the
 * shared primitives a hook plausibly needs to lint literal values the way
 * the engine itself would (path grammar, the type table, rendering,
 * truthiness). Additions are non-breaking; removals are not — grow it on
 * demand.
 */
import { parsePath, resolvePath, renderText, isTruthy } from '../primitives'
import { checkType, checkConstraints, describeType } from '../typeCheck'

export const validateHelpers = Object.freeze({
  parsePath,
  resolvePath,
  checkType,
  checkConstraints,
  describeType,
  renderText,
  isTruthy,
})

export type ValidateHelpers = typeof validateHelpers
