import FigTreeEvaluator, { evaluateExpression } from '../src'

const exp = new FigTreeEvaluator()

// STRING SUBSTITUTION

test('Simple string substitution', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['Hello, %1, welcome to our site.', 'friend'],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('Hello, friend, welcome to our site.')
  })
})

test('Simple string substitution - multiple replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: [
      'There are %1 kinds of people in the world:\nthose who understand %2 and those who %3',
      '10',
      'binary',
      "don't",
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(
      "There are 10 kinds of people in the world:\nthose who understand binary and those who don't"
    )
  })
})

test('String substitution - non-string replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: [
      'We have %1 %2 listed with an average value of %3: %4',
      2,
      'people',
      4.53,
      ['Boba', 'Mando'],
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('We have 2 people listed with an average value of 4.53: Boba,Mando')
  })
})

// Same as previous, just with properties instead of children
test('String substitution - non-string replacements, using properties', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'We have %1 %2 listed with an average value of %3: %4',
    substitutions: [2, 'people', 4.53, ['Boba', 'Mando']],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('We have 2 people listed with an average value of 4.53: Boba,Mando')
  })
})

test('String substitution - too many replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['The price of milk is %1 per %2', '$2.30', 'liter', 'gallon', '$5.00'],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('The price of milk is $2.30 per liter')
  })
})

test('String substitution - too few replacements,', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ["The applicant's name is %1 %2 %3.", 'Wanda', 'Maximoff'],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe("The applicant's name is Wanda Maximoff .")
  })
})

test('String substitution - parameters not ordered, using properties,', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '%2 out of every %3 people are %1',
    substitutions: ['stupid', 'Two', 3],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('Two out of every 3 people are stupid')
  })
})

test('String substitution - parameters not ordered and too few, using props,', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '%2 out of every %3 people are %1',
    replacements: ['stupid', 'Two'],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('Two out of every  people are stupid')
  })
})

test('String substitution - parameters not sequential,', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: [
      `It shouldn't matter if %10 are big %100 between %101 %200`,
      'there',
      'gaps',
      'parameter',
      'numbers',
    ],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe("It shouldn't matter if there are big gaps between parameter numbers")
  })
})

test('String substitution - no parameters', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This sentence has no replacements.',
    substitutions: ['nothing', 'will', 'happen'],
  }
  return evaluateExpression(expression).then((result: any) => {
    expect(result).toBe('This sentence has no replacements.')
  })
})

test('String substitution - no replacements supplied', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['Your name is %2 %1 but we have nothing to replace them with'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('Your name is   but we have nothing to replace them with')
  })
})

test('String substitution - some parameters empty strings', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'You like: %1%2%3',
    substitutions: ['', '\\n-Cake', '\\n-Candy'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('You like: \\n-Cake\\n-Candy')
  })
})

test('String substitution - repeated parameterss', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '%1 is the same as %1 but not %2',
    substitutions: ['THIS', 'THAT'],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('THIS is the same as THIS but not THAT')
  })
})
