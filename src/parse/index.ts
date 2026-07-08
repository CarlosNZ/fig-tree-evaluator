/**
 * The parser — internal machinery behind `validate()` (and, from Phase 4,
 * `evaluate()`). Not barrel surface: tests and the FigTree class import
 * from here directly (the registry precedent); there is no public
 * parse/compile method ("Rulings on the surface" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 */
export { parseExpression } from './parse'
export type { FragmentLookup } from './parse'
export { runStaticChecks } from './staticChecks'
export type { StaticCheckContext } from './staticChecks'
export { validateHelpers } from './helpers'
export type { ValidateHelpers } from './helpers'
export { recognizeReference, renderSegments } from './references'
export type { ReferenceRecognition } from './references'
export type {
  ArtifactDependencies,
  ArtifactHole,
  CompiledNode,
  ConstantNode,
  FragmentCallNode,
  InvalidNode,
  NodePath,
  OperatorNode,
  ParseArtifact,
  ReferenceNamespace,
  ReferenceNode,
  SequencedIssue,
  TemplateHole,
  TemplateNode,
} from './artifact'
