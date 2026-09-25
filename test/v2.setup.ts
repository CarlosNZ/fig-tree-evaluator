/**
 * Setup for the frozen v2 corpus (`pnpm test:v2`, jest.v2.config.js), which
 * was written against Jest 29 and is never edited.
 *
 * Jest 30's `objectContaining` fails any value that is not an object, where
 * Jest 29's also matched a function's properties. 25_metaData checks each
 * operator's `parseChildren` function by its name that way, so here a
 * function is matched as Jest 29 matched it: by the properties the sample
 * names.
 */
const objectContaining = expect.objectContaining.bind(expect)

expect.objectContaining = <E>(sample: E) => {
  const matcher = objectContaining(sample)
  const asymmetricMatch = matcher.asymmetricMatch.bind(matcher)
  matcher.asymmetricMatch = (other: unknown) =>
    asymmetricMatch(
      typeof other === 'function'
        ? Object.fromEntries(
            Object.keys(sample as object)
              .filter((key) => key in other)
              .map((key) => [key, (other as unknown as Record<string, unknown>)[key]])
          )
        : other
    )
  return matcher
}
