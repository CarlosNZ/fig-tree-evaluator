import { build } from 'esbuild'
// The measurement `pnpm build`, the import map and the PR size comment use,
// so the site's figures are the same figures by construction
import { compressedSizes } from '../../../codegen/bundleSize.mjs'

/** Imports from one entry point: its specifier, and the names imported. */
export interface Imports {
  entry: string
  names: string[]
}

export interface Sizes {
  gzip: number
  brotli: number
}

/** Every value an entry point exports, read from the build. */
export const exportsOf = async (entry: string): Promise<string[]> =>
  Object.keys(await import(/* @vite-ignore */ entry))

const measured = new Map<string, Promise<Sizes>>()

/**
 * The compressed size of a bundle of `imports` alone, as a consumer's
 * bundler would ship it: resolved through the linked package's `exports` to
 * its build/, bundled and minified by esbuild. The same method as
 * codegen/importTree.mjs, which writes docs-dev/imports.md.
 */
export const measureImports = (imports: Imports[]): Promise<Sizes> => {
  const contents = [
    ...imports.map(({ entry, names }) => `import { ${names.join(', ')} } from '${entry}'`),
    `console.log(${imports.flatMap(({ names }) => names).join(', ')})`,
  ].join('\n')
  if (!measured.has(contents))
    measured.set(
      contents,
      build({
        stdin: { contents, resolveDir: process.cwd() },
        bundle: true,
        minify: true,
        format: 'esm',
        write: false,
        logLevel: 'silent',
      }).then(({ outputFiles }) => {
        const { gzip, brotli } = compressedSizes(Buffer.from(outputFiles[0].text))
        return { gzip, brotli }
      })
    )
  return measured.get(contents)!
}

/** A size in kB, to one decimal place. */
export const roundedKb = (bytes: number): string => `${(bytes / 1000).toFixed(1)} kB`
