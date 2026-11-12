/**
 * Messages the v3 suite never produces, each with the reason that is
 * accepted. `pnpm messages --check` fails on any other message nothing
 * produced, and on an entry here that no longer matches a message or that
 * the suite now produces.
 *
 * An entry names its file and the message as the page shows it, holes
 * included, so it survives the message moving within the file. It
 * covers every message in the file that reads that way.
 */
export interface Unreached {
  file: string
  message: string
  reason: string
}

const GUARD =
  'Guards against an engine bug: only an expression the static checks refuse can reach it, ' +
  'and those never get this far.'

const guards = (file: string, messages: string[]): Unreached[] =>
  messages.map((message) => ({ file, message, reason: GUARD }))

export const unreached: Unreached[] = [
  ...guards('src/evaluate/internal.ts', [
    '[fig-tree internal] ${message}',
    '${what} reached evaluation — the static gate should have refused it',
  ]),
  ...guards('src/evaluate/evaluate.ts', ["a '${node.kind}' node reached the node dispatch"]),
  ...guards('src/evaluate/fragment.ts', ["fragment call '${node.name}'"]),
  ...guards('src/authoring/walk.ts', [
    '[fig-tree internal] ${what} reached the coverage walk — the static gate should have refused it',
    'an invalid node',
    "an unresolved '${node.raw}'",
    "'${node.raw}' outside a fragment body",
    "a call to the unknown fragment '${node.name}'",
  ]),
]
