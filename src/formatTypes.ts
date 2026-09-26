/**
 * The shapes `fig-tree-evaluator/format` takes ("Surface" in
 * docs-dev/v3-specs/v3-format.md). Types only, exported from the root, so
 * the subpath stays a function module with no type surface of its own
 * ("Types" in docs-dev/v3-specs/v3-packaging.md).
 */

/**
 * What the conversions read from a registry: each operator's names and
 * positions, and each fragment's name. A `FigTree` satisfies it, and so does
 * an object serving `getOperators()` / `getFragments()` snapshots. It names
 * only these fields so that declaring it copies nothing else of `FigTree`'s
 * type graph into the subpath's declarations.
 */
export interface Registry {
  getOperators(): readonly {
    name: string
    alias?: string
    positionalParams?: readonly string[]
    restParam: string | null
  }[]
  getFragments(): readonly { name: string }[]
}

/**
 * How a converted name is spelled: as written, canonical (`plus`,
 * `$data`), or the alias (`+`, `$d`) where one exists.
 */
export type Spelling = 'preserve' | 'canonical' | 'alias'

export interface NameOptions {
  /**
   * How a whole-string reference spells its namespace. Default
   * `'preserve'`.
   */
  referenceNames?: Spelling
}

export interface CanonicalOptions extends NameOptions {
  /** Default `'preserve'`. */
  operatorNames?: Spelling
  /**
   * Converts every reference `toGet` accepts into a `get` node. Default
   * `false`: an editor sets it when the selected node is itself a reference.
   */
  referencesAsGet?: boolean
}

export interface ShorthandOptions extends NameOptions {
  /** Default `'preserve'`. */
  operatorNames?: Spelling
  /**
   * `'positional'` uses an array or single-value payload wherever it reads
   * back the same, and the named payload otherwise. Default `'positional'`.
   */
  arguments?: 'positional' | 'named'
  /** Converts every `get` node `toReference` accepts. Default `true`. */
  getAsReference?: boolean
}
