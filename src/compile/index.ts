/**
 * The compiler — internal machinery behind `validate()`, `evaluate()` and
 * `compile()`. Not barrel surface: tests and the FigTree class import from
 * here directly (the registry precedent). The public `compile()` returns a
 * `CompiledExpression` handle over this machinery, and nothing of the
 * pipeline itself ("Rulings on the surface" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 */
export { composeRollups, compileExpression } from './compile'
export type { CompileOptions } from './compile'
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
  LinkedPath,
  NodePath,
  OperatorNode,
  CompileArtifact,
  ReferenceNamespace,
  ReferenceNode,
  Rollups,
  SequencedIssue,
  SkeletonHole,
  SkeletonNode,
} from './artifact'
export { bindsReference, extendPath, renamedBinding, splice, toNodePath } from './artifact'
export { probeConstant, DEPTH_CEILING } from './probe'
export { CompileCache, CONTENT_LAYER_SIZE } from './compileCache'
export type { CacheEntry } from './compileCache'
// The result cache's `'auto'` keys use the same serializer (Phase 9.1) —
// its second consumer, as `lru.ts` is shared with the content layer
export { serializeInput } from './contentKey'
export type { ProbeResult } from './probe'
