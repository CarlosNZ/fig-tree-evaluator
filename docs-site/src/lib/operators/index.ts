import type { OperatorAnalysis, ValidatedOperatorDefinition } from 'fig-tree-evaluator'
import { daysInMonth, daysInMonthAnalysis } from './daysInMonth'
import { distance } from './distance'
import { formatNumber } from './formatNumber'
import { hash } from './hash'
import { median, medianAnalysis } from './median'
import { sortBy } from './sortBy'

/**
 * The custom operators the Custom operators pages' examples use, and
 * /authoring's `median` and `daysInMonth`, one file each. Each file is
 * exactly what its page shows (OperatorSource.astro), so the definition on
 * the page is always the one that ran.
 *
 * Only examples that ask for them see these (`customOperators` on
 * <Expression> and <Playground>): everywhere else, the site's editors and
 * the operator reference know only the package's own operators.
 */
export const customOperators: ValidatedOperatorDefinition[] = [
  formatNumber,
  hash,
  distance,
  sortBy,
  median,
  daysInMonth,
]

/**
 * The analyses fallbackCoverage() reads for those operators. One left out is
 * external to it: it may fail whatever its inputs.
 */
export const customAnalyses: OperatorAnalysis[] = [medianAnalysis, daysInMonthAnalysis]
