/**
 * Body-parameter type inference ("TypeScript ergonomics" in
 * docs-dev/v3-specs/v3-operator-contract.md): the `params` a body receives
 * is typed from the declarations `defineOperator()` is given, with no
 * annotations and no `as const` (the `const` type parameter does that).
 *
 * The mapping, layer by layer, mirrors what the engine delivers:
 *   - the declared `type` maps to its TS type (`'string'` → `string`,
 *     `['number', 'null']` → `number | null`, literal unions → their
 *     members, `integer` → `number`, `any` → `unknown`);
 *   - `propagate` (the default wherever the type names `null` and nothing
 *     else is declared) removes `null` — the engine short-circuits before
 *     the body; `nullPolicy: 'value'` keeps it; a conditional policy keeps
 *     it (either may apply);
 *   - `truthiness: true` → `boolean` (`boolean[]` for an array position);
 *   - `evaluation: 'lazy'` → `LazyValue<T>`, `'perElement'` →
 *     `PerElement<T>`, `'lazyElements'` → `LazyValue<T>[]`,
 *     `'lazyEntries'` → `Record<string, LazyValue<T>>`, `'race'` →
 *     `SettlementStream`, `'structural'` → the literal type;
 *   - an optional parameter with no `default` is an optional key; with a
 *     `default` the key is always present;
 *   - a `replacesNullAt` holder never reaches the body, so it has no key.
 *
 * Fed an un-narrowed `Record<string, ParameterDeclaration>` (a definition
 * built dynamically), every rule falls through to `Record<string, unknown>`.
 */
import type { ParameterDeclarations, NullPolicyValue } from './operatorDefinition'
import type { LazyValue, PerElement, SettlementStream } from './runtimeInterface'

/** The TS type a metadata type expression admits. */
export type TypeOf<T> = T extends 'string'
  ? string
  : T extends 'number' | 'integer'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'array'
        ? unknown[]
        : T extends 'object'
          ? Record<string, unknown>
          : T extends 'null'
            ? null
            : T extends 'any'
              ? unknown
              : T extends { literal: readonly (infer M)[] }
                ? M
                : T extends readonly (infer B)[]
                  ? TypeOf<B>
                  : unknown

/** The declared type, `'any'` when the declaration leaves it out. */
type DeclaredType<P> = P extends { type: infer T } ? T : 'any'

/** Does the body see `null` at this position? */
type KeepsNull<P> = P extends { truthiness: true } | { nullPolicy: 'value' }
  ? true
  : P extends { nullPolicy: NullPolicyValue }
    ? false
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      P extends { nullPolicy: (...args: any) => any }
      ? true
      : false

/** The value after the null layer: `propagate` removes `null`. */
type Delivered<P> =
  KeepsNull<P> extends true ? TypeOf<DeclaredType<P>> : Exclude<TypeOf<DeclaredType<P>>, null>

/** A truthiness position: booleans, per element for a container position. */
type Truthy<P> = P extends { type: 'array' }
  ? boolean[]
  : P extends { type: 'object' }
    ? Record<string, boolean>
    : boolean

/** What one declaration delivers to the body. */
export type ParamValue<P> = P extends { truthiness: true }
  ? Truthy<P>
  : P extends { evaluation: 'structural' }
    ? TypeOf<DeclaredType<P>>
    : P extends { evaluation: 'lazy' }
      ? LazyValue<Delivered<P>>
      : P extends { evaluation: 'perElement' }
        ? PerElement<Delivered<P>>
        : P extends { evaluation: 'lazyElements' }
          ? LazyValue<Delivered<P>>[]
          : P extends { evaluation: 'lazyEntries' }
            ? Record<string, LazyValue<Delivered<P>>>
            : P extends { evaluation: 'race' }
              ? SettlementStream
              : Delivered<P>

type IsHolder<P> = P extends { replacesNullAt: readonly string[] } ? true : false

type IsOptional<P> = P extends { default: unknown }
  ? false
  : P extends { required: false }
    ? true
    : false

type BodyKeys<D> = { [K in keyof D]: IsHolder<D[K]> extends true ? never : K }[keyof D]
type OptionalKeys<D> = {
  [K in BodyKeys<D>]: IsOptional<D[K]> extends true ? K : never
}[BodyKeys<D>]
type RequiredKeys<D> = Exclude<BodyKeys<D>, OptionalKeys<D>>

type Simplify<T> = { [K in keyof T]: T[K] } & {}

/**
 * The post-everything parameters a body receives, typed from its
 * declarations: positional mapping applied, defaults resolved, type checks
 * passed, null policies enforced, truthiness delivered. Unset optionals
 * without a default are absent keys, hence optional here.
 */
export type ResolvedParams<D extends ParameterDeclarations = ParameterDeclarations> = Simplify<
  { [K in RequiredKeys<D>]: ParamValue<D[K]> } & { [K in OptionalKeys<D>]?: ParamValue<D[K]> }
>
