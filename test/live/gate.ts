/**
 * The probe the on-demand suites share.
 *
 * These suites need a resource CI does not have — a network connection, or
 * a local Northwind Postgres — and they sit outside the default run by
 * CONFIGURATION: `jest.config.js` ignores this directory, so hermeticity
 * is a property of the setup rather than of every file remembering to
 * guard itself. This is the second layer: running `pnpm test:live` on a
 * machine without the resource reports visible skips rather than red.
 */
export interface Gate {
  /** Run the probe once, in `beforeAll`. */
  open: (probe: () => Promise<unknown>) => Promise<void>
  /** False when the resource was unreachable — the case returns early. */
  ok: () => boolean
}

export const gate = (what: string): Gate => {
  let reachable = false
  return {
    open: async (probe) => {
      try {
        await probe()
        reachable = true
      } catch (error) {
        reachable = false
        console.warn(`  ⚠ skipping: ${what} is unavailable — ${(error as Error).message}`)
      }
    },
    ok: () => reachable,
  }
}
