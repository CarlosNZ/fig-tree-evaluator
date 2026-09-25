/**
 * Requests no double can answer ("I/O" in docs-dev/v3-specs/v3-converter.md).
 *
 * Each double fails such a request, as the Jest mocks always have. But an
 * engine catches that failure, and a fallback may swallow it, so on its own
 * it would pass for a case's outcome, and both engines failing alike would
 * count as a match. The doubles also report it here, and the runner, which
 * listens, stops the run.
 */
type Listener = (message: string) => void

let listener: Listener | undefined

/** The runner's listener, or `undefined` for none, as under Jest */
export const onUnanswered = (listen: Listener | undefined): void => {
  listener = listen
}

/** Reports the request, and returns the error that fails it */
export const unanswered = (message: string): Error => {
  listener?.(message)
  return new Error(message)
}
