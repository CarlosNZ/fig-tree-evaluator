import { defineRouteMiddleware } from '@astrojs/starlight/route-data'
import { categoryId, operatorGroups } from './lib/operatorCatalog'

/** The operators page, whose sections the reference renders (OperatorReference.astro). */
const OPERATORS_PAGE = 'reference/operators'

/** The id of the hidden heading Markdown gives a page's footnotes. */
const FOOTNOTES_HEADING = 'footnote-label'

/**
 * Starlight builds a page's contents list from the headings in its Markdown.
 * Footnotes come with a heading of their own, for screen readers, which the
 * list leaves out. The operators page's category headings come from a
 * component, so its list is given them here, from the same catalog the page
 * renders.
 */
export const onRequest = defineRouteMiddleware(({ locals }) => {
  const { id, toc } = locals.starlightRoute
  if (!toc) return
  toc.items = toc.items.filter((item) => item.slug !== FOOTNOTES_HEADING)
  if (id !== OPERATORS_PAGE) return
  toc.items.push(
    ...operatorGroups().map(({ category }) => ({
      depth: 2,
      slug: categoryId(category.name),
      text: category.displayName,
      children: [],
    }))
  )
})
