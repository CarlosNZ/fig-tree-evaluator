import { defineRouteMiddleware } from '@astrojs/starlight/route-data'
import { categoryId, operatorGroups } from './lib/operatorCatalog'

/** The operators page, whose sections the reference renders (OperatorReference.astro). */
const OPERATORS_PAGE = 'reference/operators'

/**
 * Starlight builds a page's contents list from the headings in its Markdown,
 * and the operators page's category headings come from a component, so its
 * list is given them here, from the same catalog the page renders.
 */
export const onRequest = defineRouteMiddleware(({ locals }) => {
  const { id, toc } = locals.starlightRoute
  if (id !== OPERATORS_PAGE || !toc) return
  toc.items.push(
    ...operatorGroups().map(({ category }) => ({
      depth: 2,
      slug: categoryId(category.name),
      text: category.displayName,
      children: [],
    }))
  )
})
