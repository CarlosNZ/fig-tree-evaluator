/**
 * Types for the CommonJS build of `object-property-extractor`, which
 * tsconfig.bench.json maps the bare specifier onto (see the note there:
 * the package's ESM build is unusable from a real ESM importer). The
 * mapping resolves to a plain .js, which carries no declarations, so the
 * signature is restated here — copied from the package's own
 * build/index.d.ts, `any`s and all, because /v2-src was compiled against
 * exactly that and a tighter type here would report errors v2 never had.
 */
declare module 'object-property-extractor' {
  const extractProperty: (
    inputObj: unknown,
    properties: string | number | (string | number)[],
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    fallback?: any
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  ) => any
  export default extractProperty
}
