/**
 * The `FigTree` class ("The method surface at a glance" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). Construction assembles the
 * instance registry via `buildRegistry()` and throws `FigTreeError` (code
 * `invalid-options`) on any bad input — the loud-at-registration posture.
 *
 * `validate()` and `evaluate()` share one spine: the same compile (parse +
 * static checks) and the same per-call limit checks; `validate()` returns
 * the issue stream, `evaluate()` refuses on the first error-severity issue
 * and evaluates the holes otherwise. Only `evaluate()` goes through the
 * parse cache; `validate()` compiles fresh every time, so its report always
 * costs a parse and the cache holds only what evaluation asked for.
 * The two diagnostic options shape what comes back rather than how the
 * spine works: with `mode: 'report'` or `trace` in effect the method
 * returns an `EvaluationResult` envelope instead of the bare value, and
 * the class is generic over its construction options so the static type
 * follows the effective ones.
 *
 * An instance's whole mutable world is one `InstanceState` record, swapped
 * atomically. The registry, the options and (from 8.2) the parse cache are
 * derived from each other, so they may only change together: an artifact
 * bakes in registry resolution, and a cache built against one registry
 * must never answer against another.
 *
 * The RESULT cache is deliberately not in that record. It keys resolved
 * runtime values where the parse cache keys the authored input, and the
 * two invalidation stories are opposites: an `operatorDefaults` change
 * must drop every artifact and touch no result, while `clearCache()` does
 * exactly the reverse. Putting it in a record documented as "may only swap
 * together" would invert that invariant in the one place the code states
 * it, so it lives beside the record and is reconfigured rather than
 * replaced.
 */
import type {
  CallOptions,
  EvaluationOptions,
  EvaluationResult,
  FigTreeOptions,
  Merge,
  NoOptions,
  OnlyCallOptions,
  ResultShape,
} from './options'
import type { Issue, ValidationResult } from './issues'
import { buildRegistry, type OperatorRegistry } from './registry'
import {
  ParseCache,
  parseExpression,
  probeConstant,
  renderDataReference,
  runStaticChecks,
  type ParseArtifact,
} from './parse'
import { copyOptions, mergeOptions, runEvaluation } from './evaluate'
import { readCacheConfig, ResultCache } from './resultCache'
import {
  fragmentSnapshot,
  operatorSnapshot,
  toDependencies,
  type Dependencies,
  type FragmentInfo,
  type OperatorInfo,
} from './introspect'
import { FigTreeError } from './FigTreeError'
import { ErrorCodes } from './errorCodes'
import { resolvePath } from './primitives'
import { coreOperators } from './operators'
import { version } from './version'

/** Everything an instance may swap, and may only swap together. */
interface InstanceState {
  /**
   * The stored options, registry keys included — the base the next
   * `updateOptions()` merges over.
   */
  options: FigTreeOptions
  /**
   * The same options with the registry keys stripped, prepared once here
   * rather than on every call: what `getOptions()` copies, and the object
   * an evaluation that supplies no options of its own runs under as-is.
   * The definitions, and the clients closed inside them, never reach a
   * body.
   */
  evaluation: EvaluationOptions
  registry: OperatorRegistry
  /**
   * Built with the registry and discarded with it. An artifact bakes in
   * registry resolution, so a cache that outlived its registry would serve
   * stale classifications — which is exactly why `operators`, `fragments`
   * and `operatorDefaults` are the whole invalidation set, and why
   * invalidation is this field being replaced rather than a method call.
   */
  parseCache: ParseCache
}

/**
 * The three options the compile artifact consumes, and so the whole
 * invalidation set: an artifact bakes in registry resolution, and a
 * modifier default bakes into the precomputed shielding.
 *
 * Tested by presence, not by whether the value actually differs. Deciding
 * that would mean structurally comparing `operatorDefaults` for no
 * correctness gain, and a redundant rebuild costs a recompile, never a
 * wrong answer.
 */
const touchesRegistry = (update: FigTreeOptions): boolean =>
  update.operators !== undefined ||
  update.fragments !== undefined ||
  update.operatorDefaults !== undefined

/**
 * Build a whole state from the previous one and an update — the single
 * path shared by construction (from no previous state) and
 * `updateOptions`, so both validate identically.
 *
 * Validate-before-swap is structural rather than guarded: `buildRegistry`
 * throws from in here, so a caller that assigns the return value can only
 * ever assign a complete, valid record.
 *
 * An update naming none of the registry-affecting options carries the
 * registry and the parse cache across untouched. Nothing about either
 * could have changed, so rebuilding would only throw away artifacts.
 */
const buildState = (previous: InstanceState | null, update: FigTreeOptions): InstanceState => {
  // `mergeOptions` rebuilds every incoming block, so the result is already
  // instance-owned: `fragments` gets the two-level treatment and
  // `operators`, an array, replaces
  const options = mergeOptions(previous === null ? {} : previous.options, update)
  checkKillSwitchOptions(options)
  const evaluation = withoutRegistryKeys(options)
  if (previous !== null && !touchesRegistry(update))
    return { options, evaluation, registry: previous.registry, parseCache: previous.parseCache }

  const registry = buildRegistry({
    // Omitted `operators` means the core set only — no HTTP, no SQL
    operators: options.operators ?? [coreOperators],
    ...(options.operatorDefaults !== undefined
      ? { operatorDefaults: options.operatorDefaults }
      : {}),
    ...(options.fragments !== undefined ? { fragments: options.fragments } : {}),
  })
  return {
    options,
    evaluation,
    registry,
    parseCache: new ParseCache({
      compile: (expression) => compile(expression, registry),
      probe: (expression) => probeConstant(expression, registry),
    }),
  }
}

/** The stored options as they leave the instance. */
const withoutRegistryKeys = (options: FigTreeOptions): EvaluationOptions => {
  const stripped = { ...options }
  delete stripped.operators
  delete stripped.fragments
  return stripped
}

/**
 * The one compile: parse plus the metadata-driven static checks, against a
 * registry. `validate()` calls it directly; `evaluate()` reaches it through
 * the parse cache, which is what makes the two report identically.
 */
const compile = (expression: unknown, registry: OperatorRegistry): ParseArtifact => {
  const artifact = parseExpression(expression, registry)
  runStaticChecks(artifact)
  return artifact
}

export class FigTree<InstanceOpts extends FigTreeOptions = NoOptions> {
  private state: InstanceState
  private readonly results: ResultCache

  /**
   * Instance-level rather than the module export alone: the realistic
   * consumer is an editor handed a `fig` by a host whose bundled copy may
   * differ from the editor's own import.
   */
  readonly version = version

  constructor(options: InstanceOpts = {} as InstanceOpts) {
    this.state = buildState(null, options)
    this.results = new ResultCache(readCacheConfig(options.cache))
  }

  /**
   * The one sanctioned mutation path ("The method surface at a glance" in
   * docs-dev/v3-specs/v3-evaluator-methods.md). Merges by the same rule as
   * per-call options, rebuilds what the update can have changed, and swaps.
   *
   * The registry and the parse cache are rebuilt only when the update names
   * one of the three registry-affecting options (`touchesRegistry` is the
   * one place that set is defined), and the rebuild re-validates the whole
   * registry: a merged `operatorDefaults` has to be re-checked against a
   * new operator set — an entry naming an operator the new set no longer
   * registers is an error reachable no other way — and the converse holds
   * too. Any other update carries the registry and the cache across
   * untouched, since nothing about either could have changed.
   *
   * The static return type of `evaluate()` follows the constructor's
   * options and cannot follow an update: after `updateOptions({ mode })`
   * or `updateOptions({ trace })` the runtime shape changes and the type
   * does not. A TypeScript host that flips modes should pass the option
   * per call, which types correctly, or construct a second instance.
   */
  updateOptions(options: FigTreeOptions = {}): void {
    // Both validators run before either mutation, so a rejected update
    // leaves the instance exactly as it was — the same all-or-nothing
    // discipline `buildState` already has, extended to cover the second
    // thing an update can invalidate
    const next = buildState(this.state, options)
    const cache = readCacheConfig(next.options.cache)
    this.state = next
    this.results.configure(cache)
  }

  /**
   * Empty the result store ("clearCache()" in
   * docs-dev/v3-specs/v3-evaluator-methods.md): sync, all-or-nothing, for
   * when the host knows external state moved and wants the next evaluation
   * fresh without waiting out `maxTime` or building a new instance.
   *
   * The parse cache is deliberately untouched. It is semantically
   * transparent — keyed on input identity against a stable registry — so
   * there is never a correctness reason to clear it, and it has no
   * clearing API for this method to reach.
   */
  clearCache(): void {
    this.results.clear()
  }

  /**
   * A snapshot, never live internals: mutating what comes back cannot
   * reach the instance. The registry keys are excluded — `getOperators()`
   * and `getFragments()` are their richer home, and the closures inside a
   * definition do not snapshot meaningfully.
   *
   * Options are reported **as supplied**, not as effective: no default is
   * materialized into the result. That is deliberately the opposite of
   * `getOperators()`, which reports effective defaults, because the
   * question here is "what was I configured with".
   */
  getOptions(): EvaluationOptions {
    return copyOptions(this.state.evaluation)
  }

  /**
   * Every registered operator, in registration order ("Introspection:
   * `getOperators()`" in docs-dev/v3-specs/v3-operator-contract.md).
   *
   * A snapshot, never live definitions: mutating what comes back cannot
   * reach the registry. The declarative half is reported verbatim and
   * total — normalization has already filled every documented default, so
   * this is the effective declaration rather than the authored sparseness
   * — with any `operatorDefaults` override reported BESIDE the authored
   * value rather than merged over it, so a tool can tell what the
   * operator declares from what this host set.
   */
  getOperators(): OperatorInfo[] {
    return operatorSnapshot(this.state.registry)
  }

  /**
   * Every registered fragment, same posture and order ("Introspection &
   * housekeeping methods" in docs-dev/v3-specs/v3-evaluator-methods.md).
   * The body is withheld — a fragment is the host's own registration, and
   * the editor consumes the declaration surface — so the body's warnings
   * and its dependency rollup are reported in its place.
   */
  getFragments(): FragmentInfo[] {
    return fragmentSnapshot(this.state.registry)
  }

  /**
   * Full static-issue report ("validate() — the process" in
   * docs-dev/v3-specs/v3-evaluator-methods.md): synchronous, never throws
   * on expression content — even hard parse errors come back as
   * error-severity issues. Throws only on misuse of the method itself (a
   * per-call option that is instance configuration). It takes the same
   * per-call shape as `evaluate()`, of which only `data` — the sample data
   * for the missing-path check — has any bearing on a static report.
   */
  validate(expression: unknown, options?: CallOptions): ValidationResult {
    const effective =
      options === undefined
        ? this.state.evaluation
        : withCallOptions(this.state.evaluation, options)
    const artifact = compile(expression, this.state.registry)
    const issues = [...limitIssues(artifact, effective), ...artifact.issues.map((s) => s.issue)]

    // The sample-data check walks the stored dependency list, which holds
    // segments — the form `resolvePath` accepts, so nothing is re-parsed
    if (effective.data !== undefined) {
      for (const dataPath of artifact.dependencies.dataPaths.values()) {
        if (!resolvePath(effective.data, dataPath).found)
          issues.push({
            severity: 'warning',
            code: ErrorCodes.missingDataPath,
            message: `'${renderDataReference(dataPath)}' is absent from the supplied sample data`,
            path: [],
          })
      }
    }

    return {
      valid: !issues.some((issue) => issue.severity === 'error'),
      issues,
      timeoutShielded: artifact.shielded,
    }
  }

  /**
   * What an expression reads and invokes ("getDependencies()" in
   * docs-dev/v3-specs/v3-evaluator-methods.md): the statically-known
   * `$data` paths with the honesty bit beside them, the operators invoked
   * and the fragments called — transitively, since a call site composes
   * its target's record in at parse time.
   *
   * Never throws: a malformed expression reports whatever the partial
   * parse found, like `validate()`, because a tooling method that can
   * throw is one every caller wraps. It parses without the static-check
   * pass, which only appends issues, and — again like `validate()` —
   * compiles fresh rather than going through the parse cache: an editor
   * calling this per keystroke is exactly the content-layer churn that
   * exclusion exists to prevent.
   */
  getDependencies(expression: unknown): Dependencies {
    return toDependencies(parseExpression(expression, this.state.registry).dependencies)
  }

  /**
   * Does this instance's parse find anything to evaluate? ("isEvaluable(expr)"
   * in docs-dev/v3-specs/v3-evaluator-methods.md.) Deep evaluation made
   * "is this a FigTree expression" meaningless — any JSON evaluates — so
   * the question is whether there is a hole to fill or a malformed node
   * to reject. Not "would the output differ from the input": normalization
   * alone (a `//` comment key, an `undefined` value, a `vars` block with no
   * reads) changes the output and is still `false` here, because nothing
   * in such an input is an expression.
   *
   * Two halves, as the spec names them: a hole, or a static error. A
   * malformed node usually IS a hole — the parser classifies it as
   * evaluable-never-constant, so a sibling-key violation counts and an
   * unrecognized `$` key (inert data with a warning) does not — but an
   * error raised from a structural key (`vars: 'high'`) folds its
   * container to a constant with no hole at all, and only the issue stream
   * knows the expression engaged the grammar. Pass 1 suffices: the static
   * checks find issues only on operator nodes and fragment calls, which
   * are holes already, so a second walk could never change the answer.
   */
  isEvaluable(expression: unknown): boolean {
    const artifact = parseExpression(expression, this.state.registry)
    return (
      artifact.holes.length > 0 || artifact.issues.some(({ issue }) => issue.severity === 'error')
    )
  }

  /**
   * The one evaluation method ("evaluate() return shapes" in
   * docs-dev/v3-specs/v3-evaluator-methods.md).
   *
   * Throw mode returns the bare value; the first static error, or the
   * first uncaught runtime failure, rejects the call with a
   * `FigTreeError`. With `mode: 'report'` or `trace` in effect it returns
   * the `EvaluationResult` envelope instead, and the return TYPE follows
   * the effective options — the instance's, overridden by the call's, in
   * either direction.
   *
   * The call may supply the five request-scoped options only
   * (`CallOptions`); anything else is instance configuration and is
   * refused. A call with no options runs under the instance's prepared
   * options object as-is, so the everyday call pays no merge at all.
   *
   * Inert input skips the parse entirely: the constancy probe recognizes a
   * value with nothing to evaluate or normalize and returns it by identity
   * (the user's `maxDepth` still applies to its measured depth). The skip is
   * off when `trace` is requested — a skipped parse has no nodes for the
   * trace to echo — but stays on under `report`, which wants an envelope
   * rather than nodes.
   */
  evaluate<CallOpts extends CallOptions = NoOptions>(
    expression: unknown,
    options?: OnlyCallOptions<CallOpts>
  ): Promise<ResultShape<Merge<InstanceOpts, CallOpts>>> {
    return this.run(expression, options) as Promise<ResultShape<Merge<InstanceOpts, CallOpts>>>
  }

  /**
   * `evaluate()`'s body, at one fixed return type. The conditional shape
   * is a promise to the caller about which of these two the value is; it
   * cannot be produced from inside, where the options are values rather
   * than types, so the assertion happens once, above.
   */
  private async run(expression: unknown, call: CallOptions | undefined): Promise<unknown> {
    const options =
      call === undefined ? this.state.evaluation : withCallOptions(this.state.evaluation, call)
    const reporting = options.mode === 'report'
    const enveloped = reporting || options.trace === true

    // An inert input is returned by identity without being parsed. The
    // verdict is memoized in the cache's identity layer, so a repeated
    // constant container costs a pointer lookup rather than another walk.
    // Under `trace` the skip is off: a skipped parse has no nodes to echo.
    const resolved =
      options.trace === true
        ? ({ kind: 'artifact', artifact: compile(expression, this.state.registry) } as const)
        : this.state.parseCache.resolve(expression)
    if (resolved.kind === 'inert') {
      if (options.maxDepth !== undefined && resolved.depth > options.maxDepth) {
        const issue = depthIssue(resolved.depth, options.maxDepth)
        if (!reporting) throw staticError(issue, [issue])
        return envelope(null, [staticError(issue)])
      }
      return enveloped ? envelope(expression, []) : expression
    }

    const { artifact } = resolved
    const issues = [...limitIssues(artifact, options), ...artifact.issues.map((s) => s.issue)]
    const errors = issues.filter((issue) => issue.severity === 'error')
    // Under report a static failure is reported like any other, and ALL of
    // it: the pass collects the whole stream anyway, and a host that chose
    // resilience did not choose "resilient except for typos". Throw mode
    // throws the first in tree order, carrying the stream as `issues`
    if (errors.length > 0) {
      if (!reporting) throw staticError(errors[0], issues)
      return envelope(
        null,
        errors.map((issue) => staticError(issue))
      )
    }

    const outcome = await runEvaluation(artifact, options, this.results)
    return enveloped ? outcome : outcome.result
  }
}

/**
 * The envelope for a return that never ran: a static refusal, or an inert
 * input handed back by identity. Neither has a trace, nothing having been
 * instantiated.
 */
const envelope = (result: unknown, errors: FigTreeError[]): EvaluationResult => ({
  result,
  errors,
})

/**
 * The request-scoped options — the whole of what a call may supply
 * ("Per-call options" in the Options area of docs-dev/v3-specs/v3-api.md).
 * A `Set` of the keys of `CallOptions`, spelled out because a type has no
 * runtime form; the two are kept in step by the type-level test.
 */
const CALL_OPTION_KEYS: ReadonlySet<string> = new Set<keyof CallOptions>([
  'data',
  'signal',
  'timeout',
  'mode',
  'trace',
])

/**
 * The instance's prepared options with a call's laid over them: a flat
 * override, one key at a time, with no merging inside a value — per-call
 * `data` REPLACES the instance block, and is used by reference. Keys set
 * to `undefined` are ignored, so `{ data: maybeData }` with nothing to
 * pass means "not supplied". A call naming any other option is refused:
 * the rest of `FigTreeOptions` is instance configuration, and honouring it
 * per call would mean merging blocks and validating the whole shape on
 * every evaluation for a facility no call site needs. The instance object
 * is never written to — the override is a fresh copy — and a call whose
 * keys are all `undefined` runs under the instance object itself.
 */
const withCallOptions = (instance: EvaluationOptions, call: CallOptions): EvaluationOptions => {
  let merged: Record<string, unknown> | undefined
  for (const key in call) {
    const value = call[key as keyof CallOptions]
    // Tested before the key is, so `{ maxDepth: config.maxDepth }` with
    // nothing configured is "not supplied" rather than misuse
    if (value === undefined) continue
    if (!CALL_OPTION_KEYS.has(key)) throw notPerCallError(key)
    merged ??= { ...instance }
    merged[key] = value
  }
  if (merged === undefined) return instance
  // The instance's own were checked when they were set; only the call's
  // values are new
  checkKillSwitchOptions(call)
  return merged as EvaluationOptions
}

/**
 * The refusal names the request-scoped set, since the caller's next
 * question is what IS allowed. `cache` is the one that might have been
 * expected to work — the store is instance-lived, so a per-call block
 * could only ever be ignored, and refusing is the reversible direction:
 * honouring it later is additive, where quietly ignoring it and then
 * honouring it would change the meaning of expressions already in the
 * field.
 */
const notPerCallError = (key: string): FigTreeError =>
  new FigTreeError({
    code: ErrorCodes.invalidOptions,
    message: `'${key}' is not a per-call option — a call may supply data, signal, timeout, mode and trace; configure the rest at construction or via updateOptions()`,
    path: [],
  })

/**
 * The two kill-switch options ("Resource limits" in the Options area of
 * docs-dev/v3-specs/v3-api.md), checked wherever options arrive — at
 * construction and `updateOptions()` (loud at registration) and on the
 * call's own options (a per-call override can be wrong too). `undefined`
 * is the one spelling of "no deadline": zero, a negative, a non-finite
 * number or a non-number is refused rather than read as one.
 */
const checkKillSwitchOptions = (options: FigTreeOptions) => {
  const { timeout, signal } = options
  if (
    timeout !== undefined &&
    (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0)
  )
    throw new FigTreeError({
      code: ErrorCodes.invalidOptions,
      message: "'timeout' must be a positive number of milliseconds",
      path: [],
    })
  if (signal !== undefined && !isAbortSignal(signal))
    throw new FigTreeError({
      code: ErrorCodes.invalidOptions,
      message: "'signal' must be an AbortSignal",
      path: [],
    })
}

/**
 * By shape rather than `instanceof`, like the `cache.store` check: a signal
 * from another realm (an iframe, a `vm` context, a polyfill) works exactly
 * as well, since the engine only ever reads `aborted` and `reason` and
 * subscribes to `abort`.
 */
const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AbortSignal).aborted === 'boolean' &&
  typeof (value as AbortSignal).addEventListener === 'function' &&
  typeof (value as AbortSignal).removeEventListener === 'function'

/**
 * The two option-dependent checks, run per call against the artifact's
 * stored counts — never stored in the artifact (option-independence).
 */
const limitIssues = (artifact: ParseArtifact, options: EvaluationOptions): Issue[] => {
  const issues: Issue[] = []
  if (options.maxDepth !== undefined && artifact.maxDepth > options.maxDepth)
    issues.push(depthIssue(artifact.maxDepth, options.maxDepth))
  if (options.maxNodes !== undefined && artifact.nodeCount > options.maxNodes)
    issues.push({
      severity: 'error',
      code: ErrorCodes.maxNodesExceeded,
      message: `the expression holds ${artifact.nodeCount} evaluable nodes — maxNodes is ${options.maxNodes}`,
      path: [],
    })
  return issues
}

const depthIssue = (measured: number, limit: number): Issue => ({
  severity: 'error',
  code: ErrorCodes.maxDepthExceeded,
  message: `the expression nests ${measured} levels deep — maxDepth is ${limit}`,
  path: [],
})

/**
 * One error-severity issue as a `FigTreeError`.
 *
 * Throw mode passes the whole stream as `issues`, because it throws only
 * the first and nothing may be hidden behind it. Report mode passes none:
 * there, `errors` IS the stream — one entry per error-severity issue — so
 * attaching a copy of it to every entry would say the same thing N times.
 */
const staticError = (issue: Issue, issues?: Issue[]): FigTreeError =>
  new FigTreeError({
    code: issue.code,
    message: issue.message,
    path: issue.path,
    ...(issue.operator !== undefined ? { operator: issue.operator } : {}),
    ...(issues !== undefined ? { issues } : {}),
  })
