/**
 * The compiler — internal machinery behind `validate()`, `evaluate()` and
 * `compile()`. Not barrel surface: tests and the FigTree class import from
 * here directly (the registry precedent). The public `compile()` returns a
 * `CompiledExpression` handle over this machinery, and nothing of the
 * pipeline itself ("Rulings on the surface" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 */
export { composeRollups, compileExpression, staticFallbackOf } from './compile'
export type { CompileOptions } from './compile'
export { runStaticChecks } from './staticChecks'
export { checkNoCache } from './cacheChecks'
export type { StaticCheckContext } from './staticChecks'
export { validateHelpers } from './helpers'
export type { ValidateHelpers } from './helpers'
export {
  recognizeReference,
  renderDataReference,
  renderReference,
  renderSegments,
} from './references'
export type { ReferenceRecognition } from './references'
export type {
  ArtifactDependencies,
  ArtifactHole,
  CompiledNode,
  ConstantNode,
  DataRead,
  ElementsNode,
  EntriesNode,
  ErrorRead,
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
  StaticFallback,
} from './artifact'
export { bindsReference, childrenOf, renamedBinding, splice, toNodePath } from './artifact'
export { probeConstant, probeStaticFallback } from './probe'
export { staticType } from './staticType'
export { DEPTH_CEILING } from './grammar'
export { CompileCache, CONTENT_LAYER_SIZE } from './compileCache'
export type { CacheEntry } from './compileCache'
// The result cache's keys use the same serializer — its second consumer,
// as `lru.ts` is shared with the content layer
export { serializeInput } from './contentKey'
export type { ProbeResult } from './probe'
