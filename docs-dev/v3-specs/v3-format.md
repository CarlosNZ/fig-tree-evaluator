# FigTree v3 — the format utilities

_Status: **Agreed** (September 2026, Claude, from two rounds of discussion with Carl, reviewed by Carl, with the rulings from Phase 16's planning written in). It picks up the design outline in [issue #185](https://github.com/CarlosNZ/fig-tree-evaluator/issues/185) and replaces "Parked: no shorthand round-trip utilities in 3.0" in [v3-migration.md](v3-migration.md). It is built in Phase 16 of [v3-implementation-plan.md](v3-implementation-plan.md)._

## Purpose

A v3 expression can be written in several forms: canonical nodes (`{ operator: 'plus', values: [1, 2] }`), shorthand with named arguments (`{ $plus: { values: [1, 2] } }`), shorthand with positional arguments (`{ $plus: [1, 2] }`), and references in place of `get` nodes (`'$data.user.name'`). All of them compile to the same thing. This doc designs the functions that convert an expression from one form to another without changing what it means.

They are much smaller than the v2 converter. The input is already v3, so the functions never guess what an expression means. They classify each object exactly as the compiler does, and rewrite only its form. They produce no issue list: a shape they can't read stops the conversion with an error, and finding every other problem is `validate()`'s job.

## The setting

The main caller is the v3 GUI editor, built from the current v2 editor ([live](https://carlosnz.github.io/fig-tree-evaluator/)), which lives in [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react). The editor offers the conversions as affordances on a node: "To shorthand" and "To full node", plus "To reference" / "To get node" on data reads. Each one converts the selected node and everything below it, and leaves the rest of the tree alone, so a tree can mix forms. A common shape has full named nodes near the root and bare `$d.` paths at the leaves.

Two facts about the editor shape the design:

- **The editor creates nodes in full form.** A new node, or a node whose operator has just changed, is full until the author finishes with it, because the full form is the easiest one to edit parameter by parameter. So in practice an author builds a node and its children, then collapses whatever parts they want shorter. Converting the whole subtree is enough for that, and no "this level only" option is needed. Finer control, such as named forms high in the tree and positional forms lower down, can come later.
- **The editor knows where a node sits.** A function called on a subtree can't tell whether that subtree is inside a `literal` payload or a `//` value, where it would be data rather than expression. The editor can tell, and doesn't offer the affordances there.

A second caller is the converter's output: `toShorthand(migrateV2Expression(x).expression, fig)` gives a migrating host shorthand output at no extra cost.

## Surface

A new subpath, `fig-tree-evaluator/format`, with four functions. None of them is a `FigTree` method, so tooling code stays out of the root bundle.

**Why `toCanonical`.** "Canonical" is the specs' word for the full form, and the name is for developers. The editor's button says "To full node", which is the user-facing word for the same thing. Spelling is a separate axis ("Spellings", below): `toCanonical` produces canonical _form_, and changes names only when asked.

| Export        | Signature                                                                        | Does                                                                  |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `toCanonical` | `(expression: unknown, fig: Registry, options?: CanonicalOptions) => unknown`    | every node in the subtree to canonical form                           |
| `toShorthand` | `(expression: unknown, fig: Registry, options?: ShorthandOptions) => unknown`    | every node in the subtree to shorthand form                           |
| `toGet`       | `(reference: unknown, options?: NameOptions) => Record<string, unknown> \| null` | one reference string to a `get` node, or `null` if it has none        |
| `toReference` | `(node: unknown, options?: NameOptions) => string \| null`                       | one `get` node, in any form, to a reference, or `null` if it has none |

```ts
interface Registry {
  getOperators(): readonly {
    name: string
    alias?: string
    positionalParams?: readonly string[]
    restParam: string | null
  }[]
  getFragments(): readonly { name: string }[]
}

type Spelling = 'preserve' | 'canonical' | 'alias'

interface NameOptions {
  referenceNames?: Spelling // default 'preserve'
}

interface CanonicalOptions extends NameOptions {
  operatorNames?: Spelling // default 'preserve'
  referencesAsGet?: boolean // default false
}

interface ShorthandOptions extends NameOptions {
  operatorNames?: Spelling // default 'preserve'
  arguments?: 'positional' | 'named' // default 'positional'
  getAsReference?: boolean // default true
}
```

**The registry.** `toCanonical` and `toShorthand` need it in both directions. Whether `{ $plus: [1, 2] }` is an operator node depends on `plus` being registered, mapping `[1, 2]` to parameters needs `plus`'s `positionalParams`, and a `$name` key may be a fragment call instead. A `FigTree` instance satisfies `Registry` structurally. An editor that holds only serialized snapshots can pass `{ getOperators: () => ops, getFragments: () => frags }`. Each call builds its lookup once, before the walk: canonical names and aliases to each operator's positions, plus the set of fragment names.

**Why `Registry` names only what the functions read.** Declared as `Pick<FigTree, …>`, it would copy `FigTree`'s whole declaration graph into the subpath's types. The four fields are all the conversions need: no parameter declaration is read, because an unknown parameter key is carried in the named form, where the compiler reads it exactly as on the canonical node.

**The types export from the root**, beside the other subpaths' ("Types" in [v3-packaging.md](v3-packaging.md)), and the subpath exports only the four functions.

**`toGet` and `toReference` take no registry.** A reference is grammar, not a registered name. `get` is a core operator with no alias, and every host has it: operators, aliases and fragments share one namespace, so nothing else can take the name `get` or `$get`. The position of `get`'s parameters comes from its core definition.

**Why the single-node pair returns `null`.** The editor has to know whether to offer "To reference" on a node, and "To get node" on a string. A `null` result answers that without a separate predicate, and it can't be confused with a converted value, since a successful `toReference` always returns a string and a successful `toGet` always returns an object. `toCanonical` and `toShorthand` use the pair internally and keep the original value when the result is `null`.

**A malformed node stops the conversion.** `toCanonical` and `toShorthand` throw a `FigTreeError` on a shape they can't read ("What the walk visits", below), carrying the compiler's own code and message and the node's path within the converted subtree. The editor shows it, and the node can't be converted until it's fixed. Anything that doesn't affect the form doesn't throw: a type error, a missing parameter, or a reference that is out of scope in the subtree on its own. That last is why the functions don't call `validate()` first (Carl, Phase-16 planning): a subtree taken from inside an iterator, a `vars` block or a fragment body reads `$element`, `$vars` or `$params` that only its surroundings supply, and a node still being built lacks its required parameters, so validating the subtree alone would refuse most of the conversions the editor offers. `toGet` and `toReference` never throw: their `null` is the editor's "don't offer this".

**They never mutate their input.** Unchanged subtrees may be returned as the same objects rather than copies, but that isn't promised: the editor replaces the whole subtree either way.

## Spellings

Operators with a symbolic alias (`plus` / `+`) and the reference namespaces (`$data` / `$d`) each have two spellings. The conversions change form, not spelling, unless asked:

| Value         | Operator names        | Reference names |
| ------------- | --------------------- | --------------- |
| `'preserve'`  | as written            | as written      |
| `'canonical'` | `plus`                | `$data.x`       |
| `'alias'`     | `+`, where one exists | `$d.x`          |

An operator with no alias keeps its canonical name under `'alias'`. Respelling a reference swaps only the namespace token and keeps the rest of the text as written. It applies to whole-string references only: reference tokens inside a `buildString` template are text, and stay as written.

**When there's nothing to preserve.** A converted `get` node that had no `from` (so it reads `$data`) produces a reference with no spelling of its own to keep. Under `'preserve'`, `toShorthand` and `toReference` write the alias (`$d.x`), because short is the point of shorthand, and `toCanonical` and `toGet` write the canonical name wherever they build a new reference.

## What the walk visits

Each object is classified exactly as the compiler's `walkObject` does it, in the same order:

| Object                                                                  | Kind           | The walk recurses into                                                               |
| ----------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| has `operator: 'literal'`, or a `$literal` key                          | literal        | nothing — the payload is data                                                        |
| has a string `operator` naming a registered operator or alias           | operator node  | parameter values, `fallback`, `vars` values                                          |
| has a string `fragment`                                                 | fragment call  | `parameters` (values of a map, or the node computing one), `fallback`, `vars` values |
| exactly one `$name` key that is registered, plus reserved siblings only | shorthand node | as the canonical kind it stands for                                                  |
| anything else                                                           | plain object   | every value except `//`, including `vars` values                                     |

Arrays are walked element by element. Strings are checked against the reference grammar (`recognizeReference` in `src/compile/references.ts`). Every other value is returned as it is.

**The decision order is shared, not copied.** `walkObject`'s checks move into a pure `classifyObject(raw, recognizes)` in `src/compile/grammar.ts`, which returns the object's kind, or its malformation with the compiler's code and message. The compiler emits that as an issue, and these functions throw it.

These shapes throw, each with the code the compiler reports for it:

- `operator` beside `fragment`, a canonical key beside a `$name` key, and two `$name` keys (`malformed-node`, from `classifyObject`);
- a non-string `operator` or `fragment` value (`malformed-node`);
- an unregistered operator (`unknown-operator`) or fragment (`unknown-fragment`);
- a shorthand node whose siblings aren't all reserved modifiers, `useCache` beside a fragment, and a fragment payload that isn't an object (`malformed-node`);
- a canonical `literal` with no `value`, or with a key that isn't a modifier or `//` (`malformed-node`, `unknown-node-key`);
- a `parameters` key on an operator node (`malformed-node`), and a fragment call key that isn't `parameters`, a modifier or `//` (`unknown-node-key`);
- a payload with the wrong arity (`positional-arity`);
- a named payload holding a reserved node key other than `//`, such as `{ $plus: { values: [1], fallback: 0 } }` (`unknown-node-key`). Spread onto a canonical node, it would turn an error into a working modifier;
- nesting beyond the compiler's depth ceiling (`depth-ceiling`).

An unrecognised `$typo` key makes a plain object, as in the compiler, so the walk still recurses into its values. An unknown parameter key on an operator node is carried: it forces the named form, where the compiler reports it as on the canonical node. A `//` value is never walked, whatever it contains, and `useCache` is copied as it is.

## `toCanonical`

The target is the compiler's canonical form, apart from spellings: the result compiles to exactly what the input does.

- **Operator shorthand** becomes an operator node. `{ $+: [1, 2] }` becomes `{ operator: '+', values: [1, 2] }` under `'preserve'`, or `{ operator: 'plus', … }` under `'canonical'`. An array payload maps to named parameters through the compiler's own positional mapping (below), a single value binds to the first positional parameter, and a named payload is spread onto the node. Modifiers stay where they are.
- **Fragment shorthand** becomes a fragment call: `{ $frag: { a: 1 } }` becomes `{ fragment: 'frag', parameters: { a: 1 } }`, and `{ $frag: <node> }` becomes `{ fragment: 'frag', parameters: <node> }`. `{ $frag: {} }` becomes `{ fragment: 'frag', parameters: {} }`, which keeps a place in the editor to add arguments.
- **`$literal`** becomes `{ operator: 'literal', value: X }`.
- **References** are respelled per `referenceNames`, and stay references. With `referencesAsGet`, each one that `toGet` can convert becomes a `get` node instead, anywhere in the subtree. The editor sets it when the selected node is itself a reference, so that "To full node" on a `$d.x` leaf gives a `get` node, while running `toCanonical` over a whole tree leaves its `$d.` leaves alone.
- **Already-canonical nodes** are left as they are, apart from their children and spellings. "Full" doesn't mean filling in defaults, so only the parameters the author wrote appear.

**The positional mapping is shared, not copied.** The pure half of the compiler's `collectPositional` (`src/compile/compile.ts`) moves into `positionalToNamed` in `src/compile/grammar.ts`, a function over `{ positionalParams, restParam }` and a payload, which returns the named parameters as entries in positional order, or `null` for an arity error. Beside it, `singlePositionalTarget` names the parameter a single value binds. The compiler and `toCanonical` both call them.

## `toShorthand`

- **Operator node** becomes `{ $name: payload }`, where `name` follows `operatorNames` and modifiers stay as sibling keys. The sibling-key rule means every canonical operator node has a shorthand form.
- **Fragment call** becomes `{ $frag: parameters }`, with `{ $frag: {} }` for a call with no `parameters`. Fragments take only the named payload. **A call whose `parameters` is a reference string stays canonical**, because the shorthand payload has to be an object: this is the one node with no shorthand form. That includes a reference the conversion itself made: `{ fragment: 'greet', parameters: { operator: 'get', path: 'person' } }` becomes `{ fragment: 'greet', parameters: '$d.person' }` under `getAsReference`, not `{ $greet: '$d.person' }`, which is illegal. `useCache` is invalid on fragment calls, so such a call throws, like any other malformed node.
- **`literal`** becomes `{ $literal: X }`.
- **`get`**, with `getAsReference` on, becomes a reference whenever `toReference` accepts it. Otherwise it is an ordinary operator node.
- **Already-shorthand nodes** are re-rendered from their parameters, so the result depends only on what the node means, not on how it was written. That makes `toShorthand` idempotent.

### Choosing the payload

With `arguments: 'named'`, the payload is always the parameter object, `{ $if: { condition: c, then: a, else: b } }`. With `'positional'` (the default), the positional form is used wherever it is allowed, and the named form otherwise.

Let the operator's leading positional parameters be `L` and its rest parameter, if any, be `R` (`...values`). The positional form is allowed only when all of these hold:

1. **The operator declares `positionalParams`, and every supplied parameter is in it.** `get`'s `from` isn't positional, so a `get` with `from` is always named.
2. **The supplied leading parameters form an unbroken prefix of `L`.** A gap can't be filled with `null`, because `null` doesn't mean "not supplied" for a required parameter or one whose type accepts `null`.
3. **The rest parameter is supplied if and only if every leading parameter is.** An array payload that fills `L` always binds `R`, even with nothing left over: `{ $and: [] }` binds `values: []`, which is not the same as omitting `values`.
4. **A supplied rest parameter is a literal array**, so it can be spread into the payload. The one exception is below.
5. **At least one parameter is supplied.** A node with none gets the named form, `{ $now: {} }`, because an empty array would bind an empty rest.

The payload is then the leading values followed by the rest's elements.

**Single-value collapse.** A positional payload of exactly one value, where that value came from a leading parameter, is written without the array: `{ $not: x }`, not `{ $not: [x] }`. The value mustn't be an array or a plain object that isn't a node, since those would read back as a positional or named payload. The check is made on the converted child, and uses the same `classifiesAsNode` test as the compiler. A value that came out of a spread rest is never collapsed: `values: [5]` gives `{ $plus: [5] }`, since `{ $plus: 5 }` would bind `values: 5`. **Nor is a payload where a rest is bound**, even an empty one: `{ operator: 'buildString', template: 'Hi %1', substitutions: [] }` gives `{ $buildString: ['Hi %1'] }`, because `{ $buildString: 'Hi %1' }` would leave `substitutions` unsupplied. For `buildString` that changes only a warning (`unbound-token` with the empty array, none without), but for a host's operator whose rest has a default, `[]` and "not supplied" give different results.

**A computed rest.** When the operator has no leading parameters, the rest is the only one supplied, and its value isn't a literal array, the value itself is the payload: `{ $min: '$data.scores' }`, `{ $and: { $map: … } }`. A single value binds unchanged to the rest parameter, which is exactly the node that was converted. The value mustn't be a plain object that isn't a node, which would read back as a named payload. Where there are leading parameters, a computed rest makes the node named.

## `toGet` and `toReference`

**`toReference`** accepts a `get` node in any form: `{ operator: 'get', … }`, `{ $get: 'a.b' }`, `{ $get: ['a.b'] }` or `{ $get: { path: 'a.b', from: … } }`. It returns a reference only when all of these hold:

- **No `fallback`, `useCache` or `vars`.** A reference can't carry them. A `//` comment doesn't block the conversion, and is dropped ("Comments", below).
- **No `missingPathDefault`.**
- **`path` is a literal string that parses, or a literal array of string and number segments.** It's rendered with the compiler's `renderSegments`, which round-trips through `parsePath`, so the reference reads exactly the segments the node did. A computed path has no reference form.
- **No part of `path` starts with `$`.** Inside an iterator with `as`, a `$`-string may be the element: in `{ operator: 'map', input: ['user.name', 'user.email'], as: 'field', each: { operator: 'get', path: '$field' } }` each element is a path, and `'$data.$field'` would read a data key named `$field` instead. `toReference` can't see the `as`, so a `$`-prefixed path string or segment has no reference form.
- **`from` is absent, or is a reference that can be drilled into.** No `from` reads `$data`. `from: '$vars.row'` with path `a.b` gives `'$vars.row.a.b'`, and `from: '$e'` gives `'$e.a.b'`. `$index` can't be drilled, and a `from` holding a literal object or a node has no reference form.

An empty path gives the bare reference itself: `'$data'`, or `'$vars.row'`.

**`toGet`** is the inverse. It accepts a recognised reference string and returns a canonical `get` node, with the namespace's spelling following `referenceNames`:

| Reference       | Node                                                |
| --------------- | --------------------------------------------------- |
| `'$d.a.b'`      | `{ operator: 'get', path: 'a.b' }`                  |
| `'$data[0].x'`  | `{ operator: 'get', path: '[0].x' }`                |
| `'$vars.row.a'` | `{ operator: 'get', path: 'a', from: '$vars.row' }` |
| `'$params.p.a'` | `{ operator: 'get', path: 'a', from: '$params.p' }` |
| `'$e.name'`     | `{ operator: 'get', path: 'name', from: '$e' }`     |

The path is the drill as written, without its leading `.`. The first segment of a `$vars` or `$params` reference picks the var or parameter, so it stays in `from`. A reference with nothing to drill (`'$data'`, `'$e'`, `'$vars.row'`), `$index`, and any string that isn't a well-formed reference return `null`.

**Equivalence.** A `get` node and its reference read through the same path resolver: that is `get`'s sugar contract, which holds by construction (`src/operators/data.ts`). Missing paths give `null` in both. Under `strictDataPaths` both fail, and a `fallback` would catch either. What differs is the compiled node type, and so the trace output and the wording of the `strictDataPaths` error. The evaluation tests below confirm the rest.

## Key order

The editor shows keys in the order they appear, so conversion keeps the author's order and changes only what it has to:

- **The invocation key keeps its position.** `operator` / `fragment` and `$name` swap places with each other. In `toCanonical` a shorthand's parameters follow `operator` directly, in the payload's order: the authored order for a named payload, the positional order for an array. In `toShorthand` the parameters move into the payload in the order they were written.
- **Everything else stays in place:** modifiers, `//`, and the keys of plain objects and fragment `parameters`. The one key that moves is a comment leaving a payload ("Comments", below).

## Comments

**A comment never stops a conversion.** It is kept wherever the requested form has room for it, and dropped where keeping it would block that form. Comments are not part of the round-trip promise. Where the editor thinks a lost comment matters, it can check the input for one and ask before converting.

- **A `get` becoming a reference loses its `//`**, since a string can't carry one. This is the only case where a comment is dropped, and it is the default in `toShorthand` (`getAsReference` is on).
- **The usual place for a comment is on the node**, beside `operator` or the `$name` key: `{ '//': 'why', $if: { condition: c, … } }`. There it survives every conversion except a `get` becoming a reference.
- **A `//` inside a named payload** (`{ $if: { '//': 'why', condition: c, … } }`, which the compiler skips) moves onto the node, immediately before the invocation key. That happens in `toCanonical`, which has no payload to keep it in, and in `toShorthand` whenever the node takes a positional or single-value payload. Once moved, it stays on the node, so a named → positional → named round trip leaves the comment in the usual place. The move never crosses a node boundary: a payload is its own node's parameter list, and a child node's comments stay on the child. If the node already has its own `//`, the two become an array in the node's comment's place, `[nodeComment, payloadComment]`: nothing is blocked, so both are kept. Either one may already be an array, and the result is flattened, so a comment is never more than one level deep. The editor never writes a comment inside a payload, so this case comes only from hand-written or pasted JSON.
- **A `//` inside a fragment call's `parameters` stays where it is**, since `parameters` exists in both forms. So does every node-level `//` and every `//` in a plain object.

## What these functions don't do

- **Fill in parameters.** The current editor's own validation step also changes the tree, for example by inserting every required parameter with its seed value. That step belongs to the editor. It stays separate from these functions, which only rewrite the form of what's already written. `validate()` can replace the editor's reporting half. The completion half already has its seeds: an operator's come from `./editor-hints`, and a fragment's from the `FragmentHints` a host puts in the fragment definition's `metadata` (reported by `getFragments()`), both falling back to the type-seed rule on `OperatorHints.seeds`. A shared helper for completion would be a separate design.
- **Report problems.** A malformed node is left as written, and the editor surfaces it through `validate()`.
- **Know their context** (see "The setting").

## Testing

The compiler is the oracle, so most tests need no data.

- **Compile equivalence**, which happens only in the tests: the functions never compile. For both functions, with `getAsReference` off, the compiled output must equal the compiled input once source paths and order are ignored. This runs over a modest curated corpus of v3 expressions, and over the differential corpus's converted expressions (`differential/`). It needs a small comparator that strips `path` and `order` from an artifact. The suite is collated with the rest at release prep.
- **Round trip and idempotence**, with `getAsReference` off, so that no comment is dropped:
  - `toCanonical(toShorthand(x))` equals `toCanonical(x)`
  - `toCanonical(toCanonical(x))` equals `toCanonical(x)`
  - `toShorthand(toShorthand(x))` equals `toShorthand(x)`

  One known exception: `{ fragment: 'f' }` goes to `{ $f: {} }`, which comes back as `{ fragment: 'f', parameters: {} }`. The test normalises it.

- **Payload choice.** A table of operators by shape — no positional parameters, leading only, rest only, leading plus rest — against supplied sets, covering gaps, empty rests, computed rests and each collapse case.
- **`getAsReference`, `toGet` and `toReference`.** Evaluation tests with data, including missing paths, with `strictDataPaths` both on and off, and each `from` namespace. A commented `get` converts, and loses its comment.
- **Comments.** Each placement in "Comments" above, including the two-comment array.
- **Malformed shapes.** Every shape listed under "What the walk visits" throws a `FigTreeError` with its code and path, and no input is mutated.
- **The converter's promise.** `deepEqual(toCanonical(x, fig, { operatorNames: 'canonical', referenceNames: 'canonical' }), x)` over the converter's output checks its "canonical v3 throughout" promise. The converter's one documented exception, a call on a converted v2 custom function written in the positional shorthand ("Batch 5" in [v3-converter.md](v3-converter.md)), is expected to come back canonical.

## Packaging

- A row in `codegen/entries.mjs` for `./format`, with a size budget set from measurement and a tree-shake marker. The budget counts the chunk the subpath shares with the root: every entry's budget is its own file plus the chunks it imports ("`./format`" in [v3-packaging.md](v3-packaging.md)).
- `exports` and `typesVersions` entries in package.json, which the build checks against the entries list.
- An exports test for the subpath, the lint rule that stops the root importing `src/format/`, and one that limits `src/format/`'s value imports to the small root modules it shares.
- The options types exported from the root, like the other subpaths' types.

## Changes to other specs

- **[v3-migration.md](v3-migration.md):** "Parked: no shorthand round-trip utilities in 3.0" becomes a pointer to this doc.
- **[v3-packaging.md](v3-packaging.md):** the `convertToShorthand` / `convertFromShorthand` row points at `./format`, the subpath joins the entry-point list with a section of its own, its types join the root's, and budgets count shared chunks.
- **[v3-converter.md](v3-converter.md) and [v3-evaluator-methods.md](v3-evaluator-methods.md):** their pointers to the parked section point here instead.
- **[docs-dev/imports.md](../imports.md):** the `./format` block, with its types from the root and the shared chunk measured.
- **[v3-implementation-plan.md](v3-implementation-plan.md):** Phase 16 for this work, with the benchmarks and release prep renumbered to 17 and 18, and a bundle-size row at its close. Phase 18 re-addresses where a subpath's types export from.
- **README:** a section on the four functions. **CLAUDE.md:** the third subpath becomes a fourth.
