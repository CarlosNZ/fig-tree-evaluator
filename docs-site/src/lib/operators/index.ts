import type { ValidatedOperatorDefinition } from 'fig-tree-evaluator'
import { distance } from './distance'
import { formatNumber } from './formatNumber'
import { hash } from './hash'
import { sortBy } from './sortBy'

/**
 * The custom operators the Custom operators pages' examples use, one file
 * each. Each file is exactly what its page shows (OperatorSource.astro), so
 * the definition on the page is always the one that ran.
 *
 * Only examples that ask for them see these (`customOperators` on
 * <Expression> and <Playground>): everywhere else, the site's editors and
 * the operator reference know only the package's own operators.
 */
export const customOperators: ValidatedOperatorDefinition[] = [formatNumber, hash, distance, sortBy]
