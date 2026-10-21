# FigTree v3 — `operatorSet()`: selecting and replacing operators

_The design record for [#258](https://github.com/CarlosNZ/fig-tree-evaluator/issues/258), agreed in discussion (Carl, October 2026). **Agreed, not yet built.** It extends "Operator registration" in the Options area of [v3-api.md](v3-api.md), and is kept in its own file to spare that one more page._

## Purpose

The `operators` option lists an instance's whole set of operators, and registration is the only way to restrict it: there is no `excludeOperators` ("Operator registration" in the Options area of [v3-api.md](v3-api.md)). Filtering the array works, but it is clumsy beyond one name and silent when wrong: `op.name !== 'uper'` removes nothing and never says so.

`operatorSet()` makes the common selections one readable call, and checks what it is given. Its main use is **replacing a core operator with the host's own version** — a locale-aware `upper`, a `round` with different rounding rules — while keeping every other one. A second operator under the same name is a collision, so replacing has to remove the original as well as add the new one. Leaving operators out with nothing in their place is the lesser use.

```ts
import { FigTree, coreOperators, defineOperator, operatorSet } from 'fig-tree-evaluator'

const myUpper = defineOperator({ name: 'upper', category: 'string', ... })

const fig = new FigTree({ operators: operatorSet(coreOperators, { replace: myUpper }) })
```

## Surface

```ts
type OperatorEntry = ValidatedOperatorDefinition | ValidatedOperatorDefinition[]

type OperatorSelector =
  | string // a canonical operator name
  | { category: OperatorCategory; except?: string | string[] }

interface OperatorSetOptions {
  only?: OperatorSelector | OperatorSelector[]
  except?: OperatorSelector | OperatorSelector[]
  replace?: ValidatedOperatorDefinition | ValidatedOperatorDefinition[]
}

operatorSet(
  ...args: [...operators: OperatorEntry[], options: OperatorSetOptions]
): ValidatedOperatorDefinition[]
```

- **The arguments before the last are the input**: exactly what the `operators` option holds, spread out — definitions, or arrays of definitions nested one level (`coreOperators`, `httpOperators(client)`, a plugin's set, the host's own operators). New operators go in here; there is no `add` option.
- **The last argument is the options object, and it is required.** Without it the call would only concatenate, which the `operators` option already does.
- **The result** is a new flat array, ready to be the `operators` option or one entry in it. Definitions are passed by reference and the input arrays are never changed.
- `OperatorEntry`, `OperatorSelector` and `OperatorSetOptions` export from the root as types.

## Selection

The three options apply in a fixed order, whatever order they are written in:

1. **`only`** keeps just the operators it selects. Without `only`, everything in the input is kept.
2. **`except`** removes the operators it selects from what `only` kept.
3. **`replace`** swaps each replacement in for the operator with the same name.

A selector is either a **name** or a **category**, and the two are told apart by shape: a bare string is always a canonical operator name, and a category is always `{ category }`. A plugin operator named `data` or `array` is never ambiguous, and TypeScript checks category values against `OperatorCategory`. Selectors in one list combine as a union, so overlaps are harmless.

A category selector can carry its own `except`, naming operators of that category to leave out of the selection. It is the same word with the same meaning at both levels — "everything except X", "this category except Y" — and it is what makes "a category minus a few" expressible in either direction, right next to the category it applies to:

```ts
// Leave out regex
operatorSet(coreOperators, { except: 'regex' })

// A small calculator
operatorSet(coreOperators, {
  only: [{ category: 'math' }, { category: 'comparison' }, 'if'],
})

// No string operators but buildString, and no `and`
operatorSet(coreOperators, {
  except: [{ category: 'string', except: 'buildString' }, 'and'],
})

// Several sets, restricted and replaced
operatorSet(coreOperators, httpOperators(client), myNewOperator, {
  except: ['regex', 'graphQL'],
  replace: [myUpper, myRound],
})
```

`only` applies to everything in the input, the host's own operators included: with `only: { category: 'math' }`, a `myNewOperator` in another category is dropped unless named (`only: [{ category: 'math' }, 'myNewOperator']`). A host who wants an operator kept out of the selection entirely lists it beside the call instead: `operators: [operatorSet(coreOperators, { … }), myNewOperator]`.

An empty list selects nothing and is allowed: `except: []` removes nothing, and `{}` changes nothing. Selections often come from configuration (`except: tenant.disabledOperators`), and an empty list there is a real answer, not a typo. `only: []` leaves nothing, which the empty-result check catches.

## Replacing

- A replacement is matched by its definition's **`name`** — not by the variable it is stored in, and not by alias.
- It takes the **position** of the operator it replaces, so registration order, and with it the order `getOperators()` and the catalog report, does not change.
- It brings **its own alias, or none**. A replacement for `plus` that declares no `'+'` retires `'+'` from the instance, and nothing checks for that: the host chooses the alias, and an expression still using `'+'` fails loudly at compile. A replacement whose alias collides with another operator's is the registry's collision error at construction.
- Its category may differ from the original's. Selection runs before replacing, so a category selector sees the original.

## Checks

The point of the helper is as much the checking as the selecting, so every selector must do something. All problems are collected and thrown together as one `FigTreeError`, with an issue per problem and a path into the arguments (`['except', 1]`, `['except', 0, 'except']`, `['replace', 0]`), as the registry reports.

| Problem                                                                               | Code                 | Message sketch                                                                                                                      |
| ------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A name selector naming no operator in the input                                       | `unknown-operator`   | `'uper' names no operator in the input — did you mean 'upper'?`                                                                     |
| A name selector that is an alias                                                      | `invalid-options`    | `selectors take canonical names — use 'plus', not its alias '+'` (as `operatorDefaults` does)                                       |
| A category with no operators in the input                                             | `invalid-options`    | `no operator in the input has category 'io'` (catches a forgotten `httpOperators(client)`)                                          |
| A category value that is not a category                                               | `invalid-options`    | `'maths' is not a category — did you mean 'math'?`                                                                                  |
| A category's `except` naming an operator outside that category                        | `invalid-options`    | `'round' is not in category 'string'`                                                                                               |
| A category selector whose `except` leaves nothing of the category                     | `invalid-options`    | `{ category: 'data', except: [...] } selects nothing`                                                                               |
| An `except` name selector matching an operator that `only` already left out           | `invalid-options`    | `'equal' is not among the operators 'only' kept`                                                                                    |
| An `except` category selector matching nothing that `only` kept (some overlap passes) | `invalid-options`    | `no operator in category 'math' is among the operators 'only' kept`                                                                 |
| A replacement whose name is not in the input                                          | `unknown-operator`   | `'uper' names no operator in the input — to add a new operator, put it in the input`                                                |
| A replacement for an operator the selection removed                                   | `invalid-options`    | `'upper' is replaced but also removed by 'except'` (or `by 'only'`)                                                                 |
| Two replacements with one name                                                        | `duplicate-operator` | `two replacements for 'upper'`                                                                                                      |
| Two operators with one name in the input (the same definition twice counts)           | `duplicate-operator` | `two operators named 'upper' in the input — to swap one for the other, pass it as 'replace'`                                        |
| An input argument that is a function, a plain definition object, or nested too deep   | `invalid-options`    | the registry's own messages, located by argument: `arguments[1] is a function — factories must be called: httpOperators(client)`    |
| A replacement that is not a branded definition, or an array inside the `replace` list | `invalid-options`    | the same, located as `replace[1]`; `'replace' takes definitions, not arrays of them`                                                |
| No input arguments                                                                    | `invalid-options`    | `operatorSet() needs at least one operator before its options`                                                                      |
| A last argument that is not a plain object, or is a definition (the options missing)  | `invalid-options`    | `the last argument must be the options object`                                                                                      |
| A last argument that looks like a definition (unbranded, with `name` and `evaluate`)  | `invalid-options`    | `the last argument has 'name' and 'evaluate' — if it is an operator, build it with defineOperator(); the options object comes last` |
| An unknown option key, or a selector of the wrong shape                               | `invalid-options`    | `unknown option 'exclude' — the options are only, except and replace`                                                               |
| A result with no operators                                                            | `invalid-options`    | `the selection leaves no operators`                                                                                                 |

How the checks read:

- **Paths.** An issue in the options has a path into the options object (`['except', 1]`); an issue in the input, a path by argument index (`[1]`, `[1, 3]`), which messages write as `arguments[1][3]`.
- **Suggestions.** An alias, a mistyped name and a mistyped category set the issue's `suggestion`: the canonical name, or the nearest name or category within two edits.
- **No follow-on issues.** Once a selector in `only` or `except` has reported a problem, the checks that read the selection are skipped: `except` against what `only` kept, a replacement for a removed operator, and the empty result. They would only report the same mistake again, so `only: 'uper'` is reported once. The empty-result check is skipped whenever anything else is reported.
- **A call that cannot be read** — no arguments, or a last argument that is not the options object — throws at once with its one issue, since nothing after it means anything.
- **An option set to `undefined` is absent**, so `except: tenant.disabledOperators` works when there are none.

Aliases are refused rather than resolved for the reason `operatorDefaults` refuses them: everything keyed on operator identity is keyed by canonical name, and the message names the canonical spelling. The helper checks names only; alias collisions across the result are the registry's, at construction, where they are reported already.

## Where it lives

The **root entry**. It is used alongside `coreOperators`, which is root, so a subpath for one function would split the most common setup line across two imports. It is a small function with no top-level side effects, so a bundle that never imports it never carries it (#193). Its row is in "The root entry" in [v3-packaging.md](v3-packaging.md), which `test/exports.test.ts` holds `src/index.ts` to.

## Considered and rejected

- **The issue's `exclude` / `include` sketch.** `include` cannot both _start from_ a set (an include-first call, `{ category: 'math' }` alone) and _add back_ what `exclude` removed, without a precedence rule to learn. `only` always starts from; adding back is a category's own `except`, written where it reads naturally.
- **Ordered rule lists** (`['math', '!power']`, as `.gitignore` reads). Terser, but stringly typed, ambiguous between names and categories, and order-dependent.
- **An `add` option.** The input already holds everything, and the add-versus-replace mistakes are caught without it: a replacement put in the input by mistake is a duplicate name there, and a new operator put in `replace` names nothing in the input; each message points to the other place.
- **A separate `replaceOperators()` helper.** Restricting and replacing in one setup would then be nested calls; one options object reads top to bottom.
- **Names.** `excludeOperators` echoes the removed v2 option and suits only one direction. `selectOperators` and similar take the form of `coreOperators` and `httpOperators`, and so read as another set of operators rather than a function. `operatorSelect` reads as a `<select>` component. `operatorSet` is a noun naming what the call returns.
- **An optional options object.** Without it the call only concatenates, and TypeScript allows no optional element after a rest element, so it would cost overloads for a call that does nothing.
- **A nested key other than `except`** (`keep` inside `except`, `drop` inside `only`), to avoid the double negative in `except: [{ category: 'string', except: 'buildString' }]`. Two words to learn instead of one, for a construct that reads well enough beside its category.
- **Checking a replacement's alias against the original's.** The host chooses the alias; dropping one breaks expressions loudly, at compile.
- **Typed operator names.** `coreOperators` is typed `ValidatedOperatorDefinition[]`, so its names do not survive into the type; names are checked at runtime, which covers plugins and host operators the same way.

## Follow-ups at implementation

- `src/index.ts`, `test/exports.test.ts`, and [docs-dev/imports.md](../imports.md) (its row and cost).
- The public docs: the TO-DO in "Choosing operators" on `v3.0-docs` to show replacing a core operator, and the README's operator-registration section.
