/**
 * The issues the converter emits, by code ("The issue catalogue" in
 * docs-dev/v3-specs/v3-converter.md): each code's tag, and its message,
 * filled from the node. The catalogue has exactly the codes of
 * `MigrationIssue['code']`, which the compiler holds it to.
 */
import type { MigrationIssue } from '../migrationTypes'

export type Path = MigrationIssue['path']

export type IssueCode = MigrationIssue['code']

/** Whether `path` is `parent` or lies beneath it */
export const isUnder = (path: Path, parent: Path) =>
  parent.length <= path.length && parent.every((segment, i) => path[i] === segment)

export const CATALOGUE = {
  // intentional-semantic-change
  'split-trailing-empty': {
    tag: 'intentional-semantic-change',
    message: () =>
      "v2 dropped one trailing empty piece, so `'a,b,'` split to `['a', 'b']` and `''` to `[]`. v3 keeps it, giving `['a', 'b', '']` and `['']`. Where empty pieces must go, `filter` the result.",
  },
  'computed-delimiter': {
    tag: 'intentional-semantic-change',
    message: () =>
      'The delimiter is computed. v2 turned `\\n`, `\\t` and `\\r` typed as text in a delimiter ' +
      'into the characters they name, and v3 splits on the text as written. If the delimiter can ' +
      'hold such text, make it the real character.',
  },
  'output-type': {
    tag: 'intentional-semantic-change',
    message: ({ differences }: { differences: string }) =>
      `v3's \`convert\` is strict where v2 guessed: ${differences}. Check that this node's result can never be one of them.`,
  },
  'remainder-sign': {
    tag: 'intentional-semantic-change',
    message: () =>
      "v2's remainder took the sign of the dividend (−7 remainder 3 was −1), and v3's `modulo` " +
      'takes the sign of `mod` (2). They differ only when exactly one operand is negative. For ' +
      "v2's answer there, take the `modulo` of the `abs` values and give it the dividend's sign.",
  },
  'template-numbering': {
    tag: 'intentional-semantic-change',
    message: () =>
      'The template is computed, so its tokens cannot be renumbered. v2 matched tokens to ' +
      "substitutions by rank (`'%1 %3'` used the first two), and v3 matches by number. Check " +
      "that the template's tokens have no gaps.",
  },
  'named-token-source': {
    tag: 'intentional-semantic-change',
    message: () =>
      'The template or `substitutions` is computed, so the converter cannot tell which `{{…}}` ' +
      'tokens read `data` in v2, which any name missing from `substitutions` did. In v3 such a ' +
      'token is written `{{$data.name}}`. Rewrite those tokens.',
  },
  'response-collapse': {
    tag: 'intentional-semantic-change',
    message: () =>
      'v2 reduced each single-key object in the response to its value, so a list of `{ name }` ' +
      "objects came back as a list of names. v3 returns the response as sent. To keep v2's " +
      "result, project the field in `returnPath`, as in `'countries[*].name'`. The same `[*]` is " +
      'needed wherever `returnPath` crosses an array, since v2 projected a key across one silently. ' +
      'Where the array holds the one element wanted, as a lookup by name often does, `[0]` reads ' +
      "that element instead: `'[0].flag'` rather than `'[*].flag'`, which gives a list of one.",
  },
  'computed-branches': {
    tag: 'intentional-semantic-change',
    message: () =>
      '`branches` is computed. v2 evaluated the branch it picked when that was an expression, ' +
      'and answered with a `fallback` key when nothing matched. v3 returns the branch as it is, ' +
      'and reads `fallback` as an ordinary key. Check that the object holds plain values, and ' +
      'give the no-match answer with `default`.',
  },
  'graphql-relative-url': {
    tag: 'intentional-semantic-change',
    message: () =>
      'v2 joined a relative `url` to its GraphQL endpoint option, and v3 joins it to ' +
      "`http.baseEndpoint`. Check the host's `http.baseEndpoint`, or write the full URL.",
  },
  'missing-data-fallback': {
    tag: 'intentional-semantic-change',
    message: () =>
      'In v2 a missing path failed, and this `fallback` answered. In v3 the read gives `null` ' +
      'and the node carries on. For data, set the host option `strictDataPaths: true` to fail ' +
      'as v2 did, or give the read its own default (`missingPathDefault`, `firstOf`). For a ' +
      "response's `returnPath`, which `strictDataPaths` does not reach, use `firstOf`, or read " +
      'the path with a `get` and its `missingPathDefault`.',
  },
  'unprefixed-parameter': {
    tag: 'intentional-semantic-change',
    message: ({ name }: { name: string }) =>
      `v2 read the declared name \`${name}\` as written, without a \`$\`, so the declaration ` +
      `never filled the body's \`$${name}\`: its default and type did nothing, and a call that ` +
      `left \`$${name}\` out got that text. v3 applies the declaration. Check the calls that ` +
      'leave it out.',
  },

  // lossy-default
  'instance-case-insensitive': {
    tag: 'lossy-default',
    message: ({ operator }: { operator: string }) =>
      `v2's \`caseInsensitive\` option applied to this node. v3 compares case-sensitively until ` +
      `the host adds \`operatorDefaults: { ${operator}: { caseInsensitive: true } }\`, or this ` +
      'node sets `caseInsensitive: true`.',
  },
  'values-cut': {
    tag: 'lossy-default',
    message: ({ removed }: { removed: string }) =>
      `v2 used the first two values and ignored the rest. Removed: ${removed}.`,
  },
  'fallback-converted': {
    tag: 'lossy-default',
    message: ({ type }: { type: string }) =>
      `This \`fallback\` becomes \`missingPathDefault\`, which v3's \`convert\` then converts to ${type}, ` +
      'where v2 returned it as it was. Unless the default is already of that type, it fails or ' +
      'changes. Give a default of that type.',
  },
  'malformed-entry': {
    tag: 'lossy-default',
    message: () => 'v2 skipped an entry with no `key` or no `value`. Removed.',
  },
  'overridden-value': {
    tag: 'lossy-default',
    message: ({ key, winner }: { key: string; winner: string }) =>
      `v2 never read \`${key}\`: \`${winner}\` gave the same parameter and won. Removed.`,
  },
  'discarded-expression': {
    tag: 'lossy-default',
    message: () =>
      'v2 evaluated this and then discarded it, so a failure in it failed the node, and any ' +
      'request, query or function call in it ran. v3 never evaluates it. Removed.',
  },
  'unreachable-branches': {
    tag: 'lossy-default',
    message: () =>
      "`branches` has a `fallback`, which v2 answered with before it read the node's own keys, so this branch was never reached. Removed.",
  },
  'fragment-shorthand-payload': {
    tag: 'lossy-default',
    message: () =>
      'A fragment shorthand takes an object of arguments. v2 spread this one into `parameters`, where it named nothing, so the call had no arguments. Removed.',
  },
  'shadowed-argument': {
    tag: 'lossy-default',
    message: ({ fragment, key }: { fragment: string; key: string }) =>
      `The body of \`${fragment}\` sets its own \`${key}\`, which beat this argument in v2, so the argument never applied. Removed.`,
  },
  'unknown-argument': {
    tag: 'lossy-default',
    message: ({ fragment, name }: { fragment: string; name: string }) =>
      `\`${fragment}\` has no parameter \`${name}\`. v2 ignored the argument, and v3 rejects it. Removed.`,
  },
  'fragment-use-cache': {
    tag: 'lossy-default',
    message: () =>
      'A v3 fragment call takes no `useCache`, since caching is set on the operators inside ' +
      "the body. v2 applied this one to the body's node, unless the body set its own. Removed. " +
      'Set `useCache` in the definition if the body needs it.',
  },
  'unused-output-type': {
    tag: 'lossy-default',
    message: ({ key, reason }: { key: string; reason: string }) =>
      `v2 never applied this \`${key}\`: ${reason}. Removed.`,
  },
  'name-renamed': {
    tag: 'lossy-default',
    message: ({ name, reason, renamed }: { name: string; reason: string; renamed: string }) =>
      `\`${name}\` cannot be registered in v3 (${reason}), so it is renamed \`${renamed}\`, and ` +
      'calls follow. Update anything outside expressions that uses the old name.',
  },
  'unknown-parameter-type': {
    tag: 'lossy-default',
    message: ({ type }: { type: string }) =>
      `\`${type}\` is not a v3 type, so the parameter takes \`'any'\`.`,
  },
  'default-outside-type': {
    tag: 'lossy-default',
    message: ({ value, type }: { value: string; type: string }) =>
      `The default \`${value}\` is not of the declared type \`${type}\`. v2 never checked it, and v3 ` +
      "would refuse to register the fragment, so the parameter takes `'any'`.",
  },

  // non-convertible
  'deciding-value': {
    tag: 'non-convertible',
    message: ({ reason, wrote, key }: { reason: string; wrote: string; key: string }) =>
      `${reason}, so the converter cannot tell what v2 did. It wrote ${wrote}, v2's default. Where \`${key}\` can be otherwise, rewrite the node by hand.`,
  },
  'drilled-substitution-token': {
    tag: 'non-convertible',
    message: ({ token, name }: { token: string; name: string }) =>
      `\`${token}\` drills into the substitution \`${name}\`, and v3's substitution tokens do not drill. Pass the drilled value as a substitution of its own.`,
  },
  'number-mapping': {
    tag: 'non-convertible',
    message: ({ token }: { token: string }) =>
      `v3 has no \`numberMapping\`, so ${token} renders the bare number. Choose the text in the substitution instead, with \`match\` or \`if\`.`,
  },
  'template-escape': {
    tag: 'non-convertible',
    message: () =>
      'v3 has no escapes, and reads `%N` and `{{…}}` in a template as tokens. To show such text ' +
      'literally, pass it in as a substitution.',
  },
  'computed-dollar-template': {
    tag: 'non-convertible',
    message: ({ what }: { what: string }) =>
      `The template's \`$N\` tokens must become \`%N\` for v3, and a computed ${what} cannot be rewritten. Rewrite the template with v3's tokens.`,
  },
  'custom-function-call': {
    tag: 'non-convertible',
    message: ({ name, rename }: { name: string; rename?: string }) =>
      `A call on the v2 custom function \`${name}\`. Register a v3 operator of that name, as "Custom functions" in the migration guide suggests, and check this call against its parameters.` +
      (rename === undefined
        ? ''
        : ` ${rename}, so register it under another name and rename the call.`),
  },
  'computed-function-name': {
    tag: 'non-convertible',
    message: () =>
      'The function name is computed, and v3 operator names are literal. The call is quoted ' +
      'unconverted. Rewrite it by hand, for example as a `match` over the functions it can name.',
  },
  'computed-children': {
    tag: 'non-convertible',
    message: ({ operator }: { operator: string }) =>
      `\`children\` is computed, and \`${operator}\` sends its children to different ` +
      'parameters, which cannot be split before evaluation. The node is quoted unconverted. ' +
      'Rewrite it with named parameters.',
  },
  'computed-arguments': {
    tag: 'non-convertible',
    message: () =>
      "The arguments are computed. v2's had `$` names and v3's do not, so as written they fill " +
      'nothing. Make the computing expression produce names without the `$`.',
  },
  'body-override': {
    tag: 'non-convertible',
    message: ({ key }: { key: string }) =>
      `In v2, \`${key}\` set the body's own \`${key}\`, through the call's spread over it. A v3 ` +
      'call passes only arguments. Removed. Make it a parameter of the fragment, or change the body.',
  },
  'replaced-output-type': {
    tag: 'non-convertible',
    message: ({ fragment }: { fragment: string }) =>
      `In v2 this \`outputType\` replaced the output type that the body of \`${fragment}\` sets ` +
      'with `type`. In v3 the body converts its result first, and this `convert` converts that, ' +
      "which gives v2's answer only where the first conversion loses nothing. Check the result, " +
      'or take the output type off the body.',
  },
  'computed-fragment-name': {
    tag: 'non-convertible',
    message: () =>
      'The fragment name is computed, and v3 fragment names are literal. The call is quoted ' +
      'unconverted. Rewrite it by hand, for example as a `match` over the fragments it can name.',
  },
  'unknown-operator': {
    tag: 'non-convertible',
    message: ({ name }: { name: string }) =>
      `\`${name}\` is not a v2 operator. If it is one of your v2 custom functions, ` +
      "list it in the conversion's `functions` option and convert again, so the call converts to a call on a custom operator of that name. The node is quoted unconverted.",
  },
} as const satisfies Record<
  IssueCode,
  { tag: MigrationIssue['tag']; message: (fill: never) => string }
>

/** What fills a code's message: nothing, or one object of named parts */
export type Fill<C extends IssueCode> = Parameters<(typeof CATALOGUE)[C]['message']>

/** The issue `code` raises at `path`, its message filled from `fill` */
export const issue = <C extends IssueCode>(
  code: C,
  path: Path,
  ...[fill]: Fill<C>
): MigrationIssue => {
  const { tag, message } = CATALOGUE[code]
  return { code, tag, path, message: (message as (fill: unknown) => string)(fill) }
}
