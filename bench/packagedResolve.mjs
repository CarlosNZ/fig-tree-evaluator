// The resolve hook bench/packaged.mjs registers. It runs before tsx's hook,
// so it asks tsx to resolve first and swaps only the result it is after.
const SOURCE = new URL('../src/index.ts', import.meta.url).href
const PACKAGED = new URL('../build/index.js', import.meta.url).href

export const resolve = async (specifier, context, nextResolve) => {
  const resolved = await nextResolve(specifier, context)
  return resolved.url === SOURCE ? { ...resolved, url: PACKAGED, format: 'module' } : resolved
}
