import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator()

// SPLIT

test('Split string by comma', () => {
  const expression = {
    operator: 'split',
    children: ['Alpha, Beta, Gamma, Delta', ','],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual(['Alpha', 'Beta', 'Gamma', 'Delta'])
  })
})

test('Default delimiter (space) with trailing space', () => {
  const expression = {
    operator: 'arraySplit',
    children: ['no need to specify delimiter '],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['no', 'need', 'to', 'specify', 'delimiter'])
  })
})

test("Don't trim whitespace", () => {
  const expression = {
    operator: 'SPLIT',
    value: 'A simple, comma-seperated, list',
    delimiter: ',',
    trimWhiteSpace: false,
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['A simple', ' comma-seperated', ' list'])
  })
})

test('Complex delimiter, with some extraneous whitespace', () => {
  const expression = {
    operator: 'split',
    string: { operator: '+', values: ['One ', '  BREAK ', ' Two ', 'BREAK', 'Three  ', 'BREAK'] },
    separator: { operator: 'pass', value: ['BREAK'], outputType: 'string' },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['One', 'Two', 'Three'])
  })
})

test('Split on a real newline character', () => {
  const expression = {
    operator: 'split',
    value: 'Line 1\nLine 2\nLine 3',
    delimiter: '\n',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['Line 1', 'Line 2', 'Line 3'])
  })
})

test('Split on a literal "\\n" escape sequence (e.g. typed into an editor field)', () => {
  const expression = {
    operator: 'split',
    value: 'Line 1\nLine 2\nLine 3',
    delimiter: '\\n',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['Line 1', 'Line 2', 'Line 3'])
  })
})

test('Split on a literal "\\t" tab escape sequence', () => {
  const expression = {
    operator: 'split',
    value: 'A\tB\tC',
    delimiter: '\\t',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['A', 'B', 'C'])
  })
})

test('Split on a literal "/" delimiter', () => {
  const expression = {
    operator: 'split',
    value: 'usr/local/bin',
    delimiter: '/',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['usr', 'local', 'bin'])
  })
})

test('Split on "/" is unaffected by escape-sequence handling', () => {
  const expression = {
    operator: 'split',
    value: 'a / b / c',
    delimiter: '/',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['a', 'b', 'c'])
  })
})

test('Split on a single backslash "\\" delimiter', () => {
  const expression = {
    operator: 'split',
    value: 'one\\two\\three',
    delimiter: '\\',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual(['one', 'two', 'three'])
  })
})
