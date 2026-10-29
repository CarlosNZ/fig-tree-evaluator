# Custom Operators

Extend the capabilities of FigTree by defining your own operators with `defineOperator()`, and registering them with the `operators` option. A custom operator is used in exactly the same way as a built-in one.

There are three registered with this FigTree instance:

- **changeCase**:

  ```
  defineOperator({
    name: 'changeCase',
    parameters: {
      string: { type: 'string' },
      toCase: { type: { literal: ['upper', 'lower'] } },
    },
    evaluate: ({ string, toCase }) =>
      toCase === 'upper' ? string.toUpperCase() : string.toLowerCase(),
    ...
  })
  ```

- **reverse** (reverse a string or array):

  ```
  defineOperator({
    name: 'reverse',
    parameters: { value: { type: ['string', 'array'] } },
    positionalParams: ['value'],
    evaluate: ({ value }) =>
      Array.isArray(value)
        ? [...value].reverse()
        : value.split('').reverse().join(''),
    ...
  })
  ```

- **currentDate** (print current date in local format):

  ```
  defineOperator({
    name: 'currentDate',
    parameters: {},
    evaluate: () => new Date().toLocaleDateString(),
    ...
  })
  ```
