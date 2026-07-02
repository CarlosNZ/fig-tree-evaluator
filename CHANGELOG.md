# Changelog

The format below (from v2.21.4 onwards) is loosely based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.23.1] - 2026-07-02

### Fixed

- `inputDefault` in a custom `FunctionDefinition` now accepts primitive values (previously only object values were valid at the type level). Falsy primitives (`0`, `false`, `""`) are also preserved by `getCustomFunctions()` instead of being silently dropped from the exposed metadata.

## [2.23.0] - 2026-06-30

### Added

- New `FigTreeEvaluator` instance method `isFigTreeExpression(expression)` — a registry-aware check for whether an expression is something *this* instance would actually evaluate. Unlike the structural stand-alone `isFigTreeExpression` export, it validates `$`-prefixed shorthand and keys against the instance's registered operators, fragments and custom functions, and follows its `evaluateFullObject` and `noShorthand` settings. Useful for editor UIs deciding whether to treat a value as an evaluable expression rather than plain data.

## [2.22.1] - 2026-06-30

### Fixed

- `convertToShorthand` now handles operator nodes in the positional `children` array form (previously emitted verbatim).
- `convertToShorthand` of `buildObject` now uses the array form regardless of whether the input uses the `properties` or `values` parameter name.

## [2.22.0] - 2026-06-29

### Changed

- The `parseChildren` operator method (`ParseChildrenMethod`) is now synchronous — its return type narrows from `OperatorNode | Promise<OperatorNode>` to `OperatorNode`. The async option had been vestigial since v2.20.6, when `parseChildren` stopped evaluating children during parsing.
- As a consequence, the conversion helpers `convertFromShorthand` and `convertV1ToV2` are now synchronous and no longer return a `Promise`. Existing `await`-ed calls continue to work unchanged.

## [2.21.6] - 2026-06-28

### Fixed

- Shorthand conversion (`convertToShorthand`) of `GET`/`POST`/`graphQL` nodes now uses the named-object form instead of the positional-array form. These operators have a custom `parseChildren` (field-name/value zipping) whose order doesn't match their parameter definitions, so the array form mis-mapped properties such as `returnProperty`.

## [2.21.5] - 2026-06-28

### Fixed

- Shorthand conversion (`convertToShorthand`) no longer drops non-parameter properties (e.g. `fallback`) when a node is converted to the positional-array form. Such nodes now use the named-object form so no information is lost.

## [2.21.4] - 2026-06-28

### Changed

- Compile bundle to ES2020 (from ES2015). Eliminates the `tslib` runtime helpers that were ~13% of the bundle, reducing it by ~7% gzipped. Minimum supported runtime is now ES2020 (Node 14+, evergreen browsers).

### Fixed

- Shorthand conversion (`convertToShorthand`) of `getData`/`objectProperties` nodes that include an `additionalData` parameter. Previously this produced a malformed, deeply-nested array instead of a named-property object.

## Earlier versions

*Trivial upgrades (e.g. documentation, small re-factors, types, etc.) not included*

- **v2.21.0**: Use default parameter values for Fragments if not provided in expression
- **v2.20.6**: Fix certain `parseChildren` methods to not evaluate while parsing
- **v2.20.0**:
  - Add helper scripts to convert V1 to V2 expressions, and to and from Shorthand syntax -- used in [FigTree Editor](https://github.com/CarlosNZ/fig-tree-editor-react) tool.
  - Small tweaks to `buildObject` and `match` operators to make them a little more consistent in their behaviour.
- **v2.19.0**: *Remove* "string" shorthand syntax (technically a breaking change, but I doubt anyone is affected by this) #124
- **v2.18.0**: Prevent HTTP clients from being bundled with main package
- **v2.17.0**: Allow Custom Functions to be expressed as Custom Operators
- **v2.16.10**: Fix for when aliases reference other aliases at the same level
- **v2.16.8**: Don't deep merge fragments, data, headers and functions when using `.updateOptions()`
- **v2.16.5**: Make sure all parameters that are objects get pre-evaluated, even when 
`evaluateFullObject` is off.
- **v2.16.0**: Standardise error response (see [Error handling](#error-handling))
- **v2.15.0**:
  - Remove `axios` package dependency and create HTTP client abstraction (with built-in wrappers for `axios` and `fetch`). *Results in significantly smaller bundle size.*
  - Generalise `PG_SQL` operator to a client-agnostic `SQL` operator (with built-in abstractions for `node-postgres` and `SQLite`)
  - ***Breaking changes*** as a result of the above: SQL client and HTTP client must be specified differently. See relevant operator details.
  - Changes to `SQL` parameters to reflect the aforementioned agnosticism.
- **v2.14.0**: Improvements to `stringSubstitution` operator:
  - Can accept nested property references (e.g. `{{user.name}}`)
  - Will also search for replacements from `data` object
- **v2.13.4**: Bug fix for `objectProperties` operator when array index larger than `9` is used, and for sequential array indexes (e.g. `prop[1][2]`)
- **v2.13.0**: Add default values to operator properties, export more types and helper methods
- **v2.12.0**: Add `caseInsensitive` option to equality/non-equality operators
- **v2.11.5**: Upgrade dependencies
- **v2.11.4**: Bundle target ES6
- **v2.11.0**: Improved package bundling (bundle size ~50%), with CommonJS and ESM outputs. Note: small **breaking change**: "FigTreeEvaluator" is no longer a default export, so need to import with: `import { FigTreeEvaluator } from 'fig-tree-evaluator'`
- **v2.10.0**: Extended stringSubstitution functionality to included named
  property substitution, trim whitespace option, and pluralisation (#97)
- **v2.9.0**: Added ability to invalidate cache by time (#94)
- **v2.8.6**: Small bug fix where `options` object would be mutated instead of replaced
- **v2.8.5**: Small bug fix in [COUNT](#count) operator
- **v2.8.4**: Refactor types, better compliance with [ESLint](https://eslint.org/) rules, add more tests
- **v2.8.0**:
  - **[Shorthand syntax](#shorthand-syntax)** (#80)
  - **Methods to retrieve [metadata](#metadata)** about operators, fragments and
    functions (#82)
- **v2.7.0**: **Add `excludeOperators` option** to allow certain operators to be
  prohibited (e.g. database lookups) (#54)
- **v2.6.0**: Resolve alias nodes that are not part of an Operator node when `evaluateFullObject` is enabled (#78)
- **v2.5.0**:
  - Bug fixes for edge cases (mainly related to backwards compatibility)
  - More backwards compatibility for very old (pre-v1) syntax (undocumented)
- **v2.4.1**: Small bug fix for Fragments edge case
- **v2.4.0**: **Implement [Fragments](#fragments)** (#74)
- **v2.3.2**: Bug fix: alias nodes not working with `evaluateFullObject` (#72)
- **v2.3.0**: **Implement [caching/memoization](#caching-memoization)** (#68)
- **v2.2.3**: Change option `objects` name to `data` (but keep backward compatibility) (#66)
- **v2.2.2**: **Option to evaluate whole object** if operator nodes are deep within it (#64)
- **v2.2.1**: More efficient branch evaluation for condition/match operators (#63)
- **v2.2.0**:
  - **New "[Match](#match)" operator** (#61)
  - Fix for regex incompatibility with Safari (#60)
- **v2.1.4**: Upgrade dependencies
- **v2.1.0**: **[Alias nodes](#alias-nodes)** (#57)
- **v2.0.4**: Backwards compatibility for customFunctions (#53)
- **v2.0.1**: **Add deep equality comparison** for objects/arrays in `=`/`!=` operators
- **v2.0.0**: Re-write as stand-alone package. Major improvements include:
  -  more [operators](#operator-reference)
  -  operator (and property) [aliases](#operator--property-aliases)
  -  more appropriately-named properties associated with each operator (as
     opposed to a single `children` array)
  -  class-based Evaluator instances
  -  runtime type-checking
  -  better error handling and error reporting
  -  more flexible output conversion
  -  more well-organised codebase
- **v1.x.x**: created specifically for [Conforma](https://github.com/openmsupply/conforma-server/wiki/Query-Syntax) application manager by [mSupplyFoundation](https://github.com/openmsupply). v2 is a complete re-write with numerous improvements, but should be 99% backwards compatible.
