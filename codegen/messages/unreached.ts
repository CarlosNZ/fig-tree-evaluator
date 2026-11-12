/**
 * Messages the v3 suite never produces, each with the reason that is
 * accepted. `pnpm messages --check` fails on any other message nothing
 * produced, and on an entry here that no longer matches a message or that
 * the suite now produces.
 *
 * An entry names its file and the message as the page shows it, holes
 * included, so it survives the message moving within the file.
 */
export interface Unreached {
  file: string
  message: string
  reason: string
}

export const unreached: Unreached[] = []
