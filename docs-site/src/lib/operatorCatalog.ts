import { getCatalog } from 'fig-tree-evaluator/catalog'
import { figTree } from './figTree'

const listed = getCatalog(figTree)

export type CatalogOperator = (typeof listed.operators)[number]
export type CatalogCategory = (typeof listed.categories)[number]

/**
 * `literal`, written as an operator entry. The compiler handles it itself, so
 * it's in no instance's operators and the catalog doesn't list it, but it's
 * written like an operator, and readers look it up like one.
 */
const data = listed.categories.find((c) => c.name === 'data')!
const literal: CatalogOperator = {
  name: 'literal',
  displayName: 'literal',
  category: 'data',
  restParam: null,
  timeoutParam: null,
  cache: false,
  returns: 'any',
  hasValidate: false,
  positionalParams: [],
  backgroundColor: data.backgroundColor,
  textColor: data.textColor,
  parameters: {
    value: {
      type: 'any',
      required: true,
      evaluationMode: 'structural',
      truthiness: false,
      nullPolicy: 'value',
      nullOutcome: 'value',
      seed: null,
      description:
        'Returned exactly as written, including any keys prefixed with $ and $data strings inside it',
    },
  },
  description: 'Use a value exactly as written — nothing inside it is evaluated',
}

/**
 * The site's instance's catalog, read once: its operators joined with the
 * package's listings (descriptions, labels, colours), and `literal` beside
 * them. The reference renders from it, and the operators page's contents list
 * is built from it (src/routeData.ts), so the two always agree.
 */
export const catalog = { ...listed, operators: [...listed.operators, literal] }

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
