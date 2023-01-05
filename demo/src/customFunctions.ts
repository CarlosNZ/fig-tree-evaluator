/*
Some functions that can be called with the "customFunctions" operator in the
demo
*/

const functions = {
  reverse: (input: unknown[] | string) => {
    if (Array.isArray(input)) return [...input].reverse()
    return input.split('').reverse().join('')
  },
  plus: (...values: any[]) => values.reduce((acc, val) => acc + val),
}

export default functions
