import { getCatalog } from 'fig-tree-evaluator/catalog'
import { figTree } from './figTree'

/**
 * The site's instance's catalog, read once: its operators joined with the
 * package's listings (descriptions, labels, colours), `literal` last among
 * them. The reference renders from it, and the operators page's contents list
 * is built from it (src/routeData.ts), so the two always agree.
 */
export const catalog = getCatalog(figTree)

export type CatalogOperator = (typeof catalog.operators)[number]
export type CatalogCategory = (typeof catalog.categories)[number]

/** The id a category's section takes on the operators page. */
export const categoryId = (category: string): string => `category-${category}`

/**
 * The operators by category: the categories in their listed order, and each
 * one's operators in the catalog's (canonical) order. Categories with no
 * operators are left out.
 */
export const operatorGroups = (): { category: CatalogCategory; operators: CatalogOperator[] }[] =>
  [...catalog.categories]
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      category,
      operators: catalog.operators.filter((op) => op.category === category.name),
    }))
    .filter(({ operators }) => operators.length > 0)
