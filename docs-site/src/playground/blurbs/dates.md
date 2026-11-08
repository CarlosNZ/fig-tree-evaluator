# Dates, your way

FigTree has no date operators, so dates are a gap an app is likely to fill itself. An app adds what it needs as **custom operators**, written with `defineOperator()` and registered on its FigTree instance, and expression authors use them like any other operator. The Playground has two:

- **`daysUntil`:** the number of days from one date to another, or from today if there's no `from`.
- **`formatDate`:** a date in words, in one of three styles: `'short'`, `'long'` or `'weekday'`.

Here's `formatDate`, slightly simplified:

```ts nocheck
defineOperator({
  name: 'formatDate',
  category: 'string',
  parameters: {
    date: { type: 'string' },
    style: { type: { literal: ['short', 'long', 'weekday'] }, default: 'long' },
  },
  positionalParams: ['date', 'style'],
  returns: 'string',
  // Checks a date written into the expression, before anything runs
  validate: ({ date }) =>
    typeof date === 'string' && !parseDate(date)
      ? [{ severity: 'error', parameter: 'date', message: `'${date}' isn't a date` }]
      : [],
  evaluate: ({ date, style }) => {
    const parsed = parseDate(date)
    // A date from the data, which validate never sees
    if (!parsed) throw new OperatorFailure(`'${date}' isn't a date`)
    return new Intl.DateTimeFormat('en-GB', STYLES[style]).format(parsed)
  },
})
```

Since the definition declares its parameters, FigTree catches mistakes at two stages:

- **Before anything runs:** a `style` that isn't one of the three, such as `'loong'`, is a static error. So is a date written into the expression that doesn't exist, such as `'2026-02-30'`, which the `validate` hook catches.
- **While it runs:** a date from the data isn't known until then, so a bad one fails the node, and the fallback catches it.

Things to try:

- Change `renews` to a date before `today`.
- Change the `style` to `'short'`, then to `'loong'`.
- Replace `'$data.renews'` in the `$formatDate` call with `'2026-02-30'`.
- Change `renews` in the data to `'14 Nov'`.
