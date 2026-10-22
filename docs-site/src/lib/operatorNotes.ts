import { getCollection, type CollectionEntry } from 'astro:content'
import type { getCatalog } from 'fig-tree-evaluator/catalog'
import { inlineMarkdown, plainHtml } from './inlineMarkdown'

/**
 * Operator notes (src/content/operator-notes/<operator>.mdx): the docs' own
 * text beside an operator's catalog listing, which is written short, for an
 * editor's UI. A note's `description`, and each of its `parameters`, either
 * adds to the listing's text (a plain string, after it in the same paragraph)
 * or replaces it (`{ replace, against }`). Its MDX body is longer notes,
 * shown below the description. Anything a note leaves out shows as listed.
 *
 * A replacement records the listing text it was written against, as a short
 * hash, so when that text changes the build stops and asks whether the
 * replacement still holds, rather than hiding the change.
 */

export type NoteText = string | { replace: string; against?: string }
type Note = CollectionEntry<'operatorNotes'>
type Catalog = ReturnType<typeof getCatalog>

/** A short hash of a listing's text (FNV-1a, 32 bits, as hex). */
export const textHash = (text: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * The listing's text (if it has any) with a note applied, as HTML. Listings
 * are written without a closing full stop, as an editor's labels are, so an
 * added sentence gets one before it.
 */
export const applyNote = (listed: string | undefined, note: NoteText | undefined): string => {
  const own = plainHtml(listed ?? '')
  if (note === undefined) return own
  if (typeof note !== 'string') return inlineMarkdown(note.replace)
  if (!own) return inlineMarkdown(note)
  return `${/[.!?:;]$/.test(own) ? own : `${own}.`} ${inlineMarkdown(note)}`
}

const checkReplacement = (
  file: string,
  what: string,
  listed: string | undefined,
  note: NoteText | undefined
): string[] => {
  if (note === undefined || typeof note === 'string') return []
  const hash = textHash(listed ?? '')
  if (note.against === hash) return []
  const fix = `Check the replacement still holds, then set \`against: ${hash}\`.`
  return note.against === undefined
    ? [`${file}: the replacement for ${what} has no \`against\`. ${fix}`]
    : [
        `${file}: ${what} has changed in the catalog since it was replaced. It now reads:\n  ${listed}\n${fix}`,
      ]
}

/**
 * Every operator note, checked against the catalog: each must name a
 * registered operator and its parameters, and each replacement must match the
 * text it was written against. The build stops, listing every problem found.
 */
export const loadOperatorNotes = async (catalog: Catalog): Promise<Map<string, Note>> => {
  const notes = await getCollection('operatorNotes')
  const problems: string[] = []
  for (const note of notes) {
    const file = `src/content/operator-notes/${note.id}.mdx`
    const operator = catalog.operators.find((op) => op.name === note.id)
    if (!operator) {
      problems.push(`${file}: there's no operator named '${note.id}'`)
      continue
    }
    const { description, parameters = {} } = note.data
    problems.push(...checkReplacement(file, 'the description', operator.description, description))
    for (const [name, text] of Object.entries(parameters)) {
      const parameter = operator.parameters[name]
      if (!parameter) problems.push(`${file}: '${note.id}' has no parameter '${name}'`)
      else
        problems.push(...checkReplacement(file, `parameter '${name}'`, parameter.description, text))
    }
  }
  if (problems.length > 0) throw new Error(`Operator notes:\n\n${problems.join('\n\n')}`)
  return new Map(notes.map((note) => [note.id, note]))
}

/**
 * Every category note (src/content/category-notes/<category>.mdx): what
 * applies to all or most of a category's operators, shown under its heading.
 * Each must name one of the catalog's categories, or the build stops.
 */
export const loadCategoryNotes = async (
  catalog: Catalog
): Promise<Map<string, CollectionEntry<'categoryNotes'>>> => {
  const notes = await getCollection('categoryNotes')
  const unknown = notes.filter((note) => !catalog.categories.some((c) => c.name === note.id))
  if (unknown.length > 0)
    throw new Error(
      `Category notes:\n\n${unknown
        .map(
          (note) =>
            `src/content/category-notes/${note.id}.mdx: there's no category named '${note.id}'`
        )
        .join('\n\n')}`
    )
  return new Map(notes.map((note) => [note.id, note]))
}
