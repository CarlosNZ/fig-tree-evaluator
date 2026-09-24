/**
 * The issues the converter emits, by code ("The issue catalogue" in
 * docs-dev/v3-specs/v3-converter.md): each code's tag, and its message,
 * filled from the node.
 *
 * TO-DO: the codes stage 2 emits (Phase 15.1, chunks 4 to 6). These are the
 * ones stage 1 emits, for what it drops.
 */
import type { MigrationIssue } from '../migrationTypes'

export type Path = MigrationIssue['path']

const CATALOGUE = {
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

/** The issue `code` raises at `path`, its message filled from `fill` */
export const issue = <C extends IssueCode>(
  code: C,
  path: Path,
  ...[fill]: Parameters<(typeof CATALOGUE)[C]['message']>
): Issue => {
  const { tag, message } = CATALOGUE[code]
  return { code, tag, path, message: (message as (fill: unknown) => string)(fill) }
}
