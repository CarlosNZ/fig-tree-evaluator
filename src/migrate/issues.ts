/**
 * The issues the converter emits, by code ("The issue catalogue" in
 * docs-dev/v3-specs/v3-converter.md): each code's tag, and its message,
 * filled from the node.
 *
 * TO-DO: the codes batches 2 to 5 and fragments emit (Phase 15.1, chunks 5
 * and 6). These are stage 1's, the frame's and batch 1's.
 */
import type { MigrationIssue } from '../migrationTypes'

export type Path = MigrationIssue['path']

const CATALOGUE = {
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
  'overridden-value': {
    tag: 'lossy-default',
    message: ({ key, winner }: { key: string; winner: string }) =>
      `v2 never read \`${key}\`: \`${winner}\` gave the same parameter and won. Removed.`,
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

  // non-convertible
  'deciding-value': {
    tag: 'non-convertible',
    message: ({ reason, wrote, key }: { reason: string; wrote: string; key: string }) =>
      `${reason}, so the converter cannot tell what v2 did. It wrote ${wrote}, v2's default. Where \`${key}\` can be otherwise, rewrite the node by hand.`,
  },
  'computed-children': {
    tag: 'non-convertible',
    message: ({ operator }: { operator: string }) =>
      `\`children\` is computed, and \`${operator}\` sends its children to different ` +
      'parameters, which cannot be split before evaluation. The node is quoted unconverted. ' +
      'Rewrite it with named parameters.',
  },
  'unknown-operator': {
    tag: 'non-convertible',
    message: ({ name }: { name: string }) =>
      `\`${name}\` is not a v2 operator. If it is a custom function, add it to \`functions\` and convert again. The node is quoted unconverted.`,
  },
} as const satisfies Record<
  string,
  { tag: MigrationIssue['tag']; message: (fill: never) => string }
>

export type IssueCode = keyof typeof CATALOGUE

/**
 * A catalogued issue. TO-DO: `code` joins `MigrationIssue` itself (Phase
 * 15.1, chunk 7).
 */
export interface Issue extends MigrationIssue {
  code: IssueCode
}

/** What fills a code's message: nothing, or one object of named parts */
export type Fill<C extends IssueCode> = Parameters<(typeof CATALOGUE)[C]['message']>

/** The issue `code` raises at `path`, its message filled from `fill` */
export const issue = <C extends IssueCode>(code: C, path: Path, ...[fill]: Fill<C>): Issue => {
  const { tag, message } = CATALOGUE[code]
  return { code, tag, path, message: (message as (fill: unknown) => string)(fill) }
}
