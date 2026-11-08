import {
  defineOperator,
  OperatorFailure,
  type ListingMap,
  type ValidateFinding,
} from 'fig-tree-evaluator'

/** A `YYYY-MM-DD` date as midnight UTC, or undefined if it isn't a real date. */
const parseDate = (text: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return undefined
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC rolls an impossible day over, such as 30 February into March
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : undefined
}

const notADate = (text: string) => `'${text}' isn't a date: write it as YYYY-MM-DD`

/** A date the expression author wrote in, checked before anything runs. */
const checkDates = (params: Record<string, unknown>, names: string[]): ValidateFinding[] =>
  names.flatMap((name) => {
    const value = params[name]
    return typeof value === 'string' && !parseDate(value)
      ? [{ severity: 'error' as const, parameter: name, message: notADate(value) }]
      : []
  })

/** A date from the data or another node, which only `evaluate` sees. */
const readDate = (text: string): Date => {
  const date = parseDate(text)
  if (!date) throw new OperatorFailure(notADate(text))
  return date
}

const today = () => {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

const DAY = 24 * 60 * 60 * 1000

const STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'numeric', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'long', day: 'numeric', month: 'long' },
}

/**
 * The custom operators the Playground's examples use. The Playground and the
 * demo each register them on an instance of their own.
 */
export const customOperators = [
  defineOperator({
    name: 'daysUntil',
    category: 'other',
    parameters: {
      date: { type: 'string' },
      from: { type: 'string', required: false },
    },
    positionalParams: ['date', 'from'],
    returns: 'number',
    validate: (params) => checkDates(params, ['date', 'from']),
    evaluate: ({ date, from }) =>
      Math.round((readDate(date).getTime() - (from ? readDate(from) : today()).getTime()) / DAY),
  }),
  defineOperator({
    name: 'formatDate',
    category: 'string',
    parameters: {
      date: { type: 'string' },
      style: { type: { literal: ['short', 'long', 'weekday'] }, default: 'long' },
    },
    positionalParams: ['date', 'style'],
    returns: 'string',
    validate: (params) => checkDates(params, ['date']),
    evaluate: ({ date, style }) =>
      new Intl.DateTimeFormat('en-GB', { ...STYLES[style], timeZone: 'UTC' }).format(
        readDate(date)
      ),
  }),
]

/**
 * How the editor presents the custom operators: their text, which no
 * operator definition carries
 */
export const operatorListings: ListingMap = {
  daysUntil: {
    displayName: 'Days until',
    description: 'The number of days from one date to another, negative if it has passed',
    parameterDescriptions: {
      date: 'The date to count to, as YYYY-MM-DD',
      from: 'The date to count from, as YYYY-MM-DD; today if not given',
    },
    samples: { date: '2026-12-25' },
  },
  formatDate: {
    displayName: 'Format date',
    description: 'Writes a date out in words',
    parameterDescriptions: {
      date: 'The date, as YYYY-MM-DD',
      style: "'short' (14/11/2026), 'long' (14 November 2026) or 'weekday' (Saturday 14 November)",
    },
    samples: { date: '2026-11-14', style: 'weekday' },
  },
}
