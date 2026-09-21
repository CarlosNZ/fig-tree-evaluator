/**
 * The parser — internal machinery behind `validate()` (and, from Phase 4,
 * `evaluate()`). Not barrel surface: tests and the FigTree class import
 * from here directly (the registry precedent); there is no public
 * parse/compile method ("Rulings on the surface" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 */
export { composeRollups, parseExpression } from './parse'
export type { ParseOptions } from './parse'
export { runStaticChecks } from './staticChecks'
export type { StaticCheckContext } from './staticChecks'
export { validateHelpers } from './helpers'
export type { ValidateHelpers } from './helpers'
export { recognizeReference, renderDataReference, renderSegments } from './references'
export type { ReferenceRecognition } from './references'
export type {
  ArtifactDependencies,
  ArtifactHole,
  CompiledNode,
  ConstantNode,
  ElementsNode,
  EntriesNode,
  FragmentCall,
  FragmentCallNode,
  InvalidNode,
  NodePath,
  OperatorNode,
  ParseArtifact,
  ReferenceNamespace,
  ReferenceNode,
  Rollups,
  SequencedIssue,
  SkeletonHole,
  SkeletonNode,
} from './artifact'
export { bindsReference, renamedBinding, splice } from './artifact'
export { probeConstant, DEPTH_CEILING } from './probe'
export { ParseCache, CONTENT_LAYER_SIZE } from './parseCache'
// The result cache's `'auto'` keys use the same serializer (Phase 9.1) —
// its second consumer, as `lru.ts` is shared with the content layer
export { serializeInput } from './contentKey'
export type { ProbeResult } from './probe'
