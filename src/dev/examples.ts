/**
 * A gallery of expressions run through the inspector — `pnpm dev examples`.
 * Each block is one `inspect()` call: comment out the ones you don't want,
 * or copy a block into the playground and edit it.
 *
 * The registry is `coreOperators` plus the demo stand-ins for shapes core
 * does not yet hold (src/dev/demoOperators.ts).
 */
import { inspect } from './inspect'

// ── Classification: what counts as evaluable ────────────────────────

// Nothing evaluable: the whole input collapses to one constant node, no
// holes. This is the identity short-circuit case.
inspect({ name: 'Iron Man', suit: { mark: 42 } }, { label: '1 · a fully constant input' })

// One reference inside an object literal: the object compiles to a
// skeleton node — the constant shape plus the hole to splice into.
inspect(
  { greeting: 'Hello', name: '$data.user.name' },
  { label: '2 · a literal with one hole (a skeleton node)' }
)

// A canonical node: `operator` key plus named parameters.
inspect(
  { operator: 'plus', values: [1, 2], expect: 'number' },
  { label: '3 · a canonical operator node' }
)

// ── Normalization: the three authored faces of one node ─────────────

// Shorthand key, symbol alias and canonical form all compile to the same
// operator node — compare the trees of 3, 4 and 5.
inspect({ $plus: [1, 2] }, { label: '4 · shorthand + positional payload' })
inspect({ operator: '+', values: [1, 2] }, { label: '5 · symbol alias, named params' })

// Positional payloads map onto named parameters by `positionalParams`:
// condition / then / else, with `else` left to its default.
inspect({ $if: ['$data.flag', 'yes'] }, { label: '6 · positional mapping, unsupplied optional' })

// Namespace aliases normalize too: `$d.x` is `$data.x`; `raw` keeps the
// authored spelling for messages.
inspect({ $not: '$d.active' }, { label: '7 · namespace alias normalization' })

// ── Scoping ─────────────────────────────────────────────────────────

// A `vars` block scopes its subtree; `$vars.x` resolves against it.
inspect(
  {
    operator: 'format',
    vars: { who: '$data.user.name' },
    template: 'Hello %1',
    substitutions: ['$vars.who'],
  },
  { label: '8 · vars block and a $vars reference' }
)

// An iterator binds `$element`/`$index` per element — or renamed bindings
// when `as` is supplied: `$order` and `$orderIndex`.
inspect(
  {
    operator: 'map',
    input: '$data.orders',
    as: 'order',
    each: { $plus: ['$order.total', 10] },
  },
  { label: '9 · iterator with an `as` renaming' }
)

// ── Precomputations: shielding and dependencies ──────────────────────

// A constant `fallback` on every hole makes the expression shielded — the
// editor's badge, computed statically.
inspect(
  { operator: 'http', url: 'https://example.com/api', fallback: null },
  { label: '10 · a statically shielded hole' }
)

// A bare `$data` makes the read-set non-enumerable: `dynamic` goes true
// and no dataPaths are recorded.
inspect({ operator: 'get', path: 'user.name', from: '$data' }, { label: '11 · a dynamic read-set' })

// ── Pass 1 errors: the grammar layer ────────────────────────────────

// An unknown operator, and a malformed node — both compile to `invalid`
// placeholder nodes so the artifact stays well-formed.
inspect({ operator: 'frobnicate', x: 1 }, { label: '12 · unknown operator' })
inspect({ operator: 42 }, { label: '13 · malformed node' })

// Two invocations in one node: one node, one invocation.
inspect({ $plus: [1], $not: true }, { label: '14 · two shorthand keys' })

// ── Pass 2 errors: the metadata layer ───────────────────────────────

// A literal that cannot satisfy its declared type, beside a key the
// operator doesn't declare (that one is caught in pass 1 — it's grammar).
inspect(
  { operator: 'clamp', value: 'not a number', bogus: 1 },
  { label: '15 · a type check and an unknown key' }
)

// A required parameter left unsupplied.
inspect({ operator: 'format', substitutions: ['x'] }, { label: '16 · missing required' })

// The feeding-position check: `not` returns boolean, `clamp.value` takes
// number|null — disjoint, so it fails at authoring time.
inspect({ operator: 'clamp', value: { $not: true } }, { label: '17 · feeding-position check' })

// An operator's own `validate` hook lints its literal parameters.
inspect({ $regex: ['([', 'gq'] }, { label: '18 · a validate-hook finding' })

// Warnings never block: an unrecognized `$` string is inert data, and a
// declared-but-unused var is dead weight.
inspect(
  { operator: 'format', vars: { unused: 1 }, template: '$notANamespace' },
  { label: '19 · warnings (unrecognized $, unreferenced var)' }
)

// ── The option-dependent checks (validate() only) ───────────────────

// These two never live in the artifact: sample data is matched against the
// recorded dataPaths, and the limits against the recorded counts. Compare
// the artifact sections above with the validate() section below.
inspect(
  { operator: 'format', template: 'Hi %1', substitutions: ['$data.user.nickname'] },
  {
    label: '20 · sample-data warning and a node limit',
    data: { user: { name: 'Iron Man' } },
    maxNodes: 3,
  }
)
