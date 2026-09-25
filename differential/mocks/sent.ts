/**
 * Every request the runner's doubles are sent, the fetch mock and the
 * Postgres stand-in ("Output" in docs-dev/v3-specs/v3-converter.md),
 * reported to the runner, which compares what each engine asked for. A case
 * whose two engines sent the same requests and still differ differs in how
 * a response was read, not in what the conversion asked for.
 */
export type SentRequest =
  | { kind: 'http'; method: string; url: string; headers: Record<string, string>; body?: unknown }
  | { kind: 'sql'; text: string; values?: unknown[] }

type Listener = (request: SentRequest) => void

let listener: Listener | undefined

/** The runner's listener, or `undefined` for none, as under Jest */
export const onSent = (listen: Listener | undefined): void => {
  listener = listen
}

export const sent = (request: SentRequest): void => listener?.(request)
