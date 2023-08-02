import FigTreeEvaluator, { evaluateExpression } from '../src'

const exp = new FigTreeEvaluator()

// STRING SUBSTITUTION

test('Simple string substitution', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['Hello, %1, welcome to our site.', 'friend'],
  }
  return evaluateExpression(expression).then((result) => {
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
  return exp.evaluate(expression).then((result) => {
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
  return exp.evaluate(expression).then((result) => {
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
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('We have 2 people listed with an average value of 4.53: Boba,Mando')
  })
})

test('String substitution - too many replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['The price of milk is %1 per %2', '$2.30', 'liter', 'gallon', '$5.00'],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('The price of milk is $2.30 per liter')
  })
})

test('String substitution - too few replacements,', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ["The applicant's name is _%1_ %2 %3.", 'Wanda', 'Maximoff'],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe("The applicant's name is _Wanda_ Maximoff .")
  })
})

test('String substitution - parameters not ordered, using properties,', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '%2 out of every %3 people are %1',
    substitutions: ['stupid', 'Two', 3],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('Two out of every 3 people are stupid')
  })
})

test('String substitution - parameters not ordered and too few, using props,', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '%2 out of every %3 people are %1',
    replacements: ['stupid', 'Two'],
  }
  return evaluateExpression(expression).then((result) => {
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
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe("It shouldn't matter if there are big gaps between parameter numbers")
  })
})

test('String substitution - no parameters', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This sentence has no replacements.',
    substitutions: ['nothing', 'will', 'happen'],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('This sentence has no replacements.')
  })
})

test('String substitution - no replacements supplied', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['Your name is %2 %1 but we have nothing to replace them with'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Your name is   but we have nothing to replace them with')
  })
})

test('String substitution - some parameters empty strings', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'You like: %1%2%3',
    substitutions: ['', '\\n-Cake', '\\n-Candy'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('You like: \\n-Cake\\n-Candy')
  })
})

test('String substitution - repeated parameterss', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '%1 is the same as %1 but not %2',
    substitutions: ['THIS', 'THAT'],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('THIS is the same as THIS but not THAT')
  })
})

test('String substitution - parameters contain further expressions', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: { $plus: ['May the %1', ' be with %2'] },
    substitutions: [
      {
        '$?': { condition: { $eq: [{ $plus: [50, 50] }, 100] }, ifTrue: 'Force', ifFalse: 'Forks' },
      },
      { $plus: ['y', 'o', 'u'] },
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('May the Force be with you')
  })
})

test('String substitution - parameters contain further expressions', () => {
  const expression = {
    operator: 'stringSub',
    string: '%1 %2 %3 %4',
    substitutions: {
      $plus: [
        ['One', 'Two'],
        ['Three', 'Four'],
      ],
    },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('One Two Three Four')
  })
})

test('String substitution -- missing parameters', async () => {
  const expression = { operator: 'replace', irrelevant: 'value' }
  await expect(exp.evaluate(expression)).rejects.toThrow(
    'Operator: STRING_SUBSTITUTION\n- Missing required property "string" (type: string)\n- Missing required property "substitutions" (type: array|object)'
  )
})

test('String substitution - missing replacements parameter', () => {
  const expression = { $replace: { string: 'This is the %1' } }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe(
      'Operator: STRING_SUBSTITUTION\n- Missing required property "substitutions" (type: array|object)'
    )
  })
})

test('String substitution with white space trimming', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This is the *%1* entry and this is the %2',
    substitutions: [' first  ', '   second '],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('This is the *first* entry and this is the second')
  })
})

test('String substitution with NO white space trimming', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This is the *%1* entry and this is the %2',
    substitutions: [' first  ', '   second '],
    trim: false,
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('This is the * first  * entry and this is the    second ')
  })
})

test('String substitution -- escape substitution chars (\\%1)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: `Only \\%1 of these should be replaced - %1`,
    substitutions: [' this one '],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Only %1 of these should be replaced - this one')
  })
})

// Repeated, but with "$" instead of "%"

test('Simple string $ substitution', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['Hello, $1, welcome to our site.', 'friend'],
    substitutionCharacter: '$',
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('Hello, friend, welcome to our site.')
  })
})

test('Simple string $ substitution - multiple replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: [
      'There are $1 kinds of people in the world:\nthose who understand $2 and those who $3',
      '10',
      'binary',
      "don't",
    ],
    substitutionCharacter: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(
      "There are 10 kinds of people in the world:\nthose who understand binary and those who don't"
    )
  })
})

test('Simple string $ substitution - ignore % fields', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ["We wouldn't $1 need %2 but when we do it should be left $3", 'often', 'alone'],
    substitutionCharacter: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe("We wouldn't often need %2 but when we do it should be left alone")
  })
})

test('String substitution - non-string replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: [
      'We have $1 $2 listed with an average value of $3: $4',
      2,
      'people',
      4.53,
      ['Boba', 'Mando'],
    ],
    subCharacter: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('We have 2 people listed with an average value of 4.53: Boba,Mando')
  })
})

// Same as previous, just with properties instead of children
test('String substitution - non-string replacements, using properties', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'We have $1 $2 listed with an average value of $3: $4',
    substitutions: [2, 'people', 4.53, ['Boba', 'Mando']],
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('We have 2 people listed with an average value of 4.53: Boba,Mando')
  })
})

test('String substitution - too many $ replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['The price of milk is $1 per $2', '$2.30', 'liter', 'gallon', '$5.00'],
    subChar: '$',
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('The price of milk is $2.30 per liter')
  })
})

test('String substitution - too few $ replacements,', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ["The applicant's name is _$1_ $2 $3.", 'Wanda', 'Maximoff'],
    subChar: '$',
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe("The applicant's name is _Wanda_ Maximoff .")
  })
})

test('String substitution - $ parameters not ordered, using properties,', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '$2 out of every $3 people are $1',
    substitutions: ['stupid', 'Two', 3],
    subChar: '$',
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('Two out of every 3 people are stupid')
  })
})

test('String substitution - $ parameters not ordered and too few, using props,', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '$2 out of every $3 people are $1',
    replacements: ['stupid', 'Two'],
    subChar: '$',
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('Two out of every  people are stupid')
  })
})

test('String substitution - $ parameters not sequential,', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: [
      `It shouldn't matter if $10 are big $100 between $101 $200`,
      'there',
      'gaps',
      'parameter',
      'numbers',
    ],
    subChar: '$',
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe("It shouldn't matter if there are big gaps between parameter numbers")
  })
})

test('String substitution - no $ replacements supplied', () => {
  const expression = {
    operator: 'stringSubstitution',
    children: ['Your name is $2 $1 but we have nothing to replace them with'],
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Your name is   but we have nothing to replace them with')
  })
})

test('String substitution - some $ parameters empty strings', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'You like: $1$2$3',
    substitutions: ['', '\\n-Cake', '\\n-Candy'],
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('You like: \\n-Cake\\n-Candy')
  })
})

test('String substitution - repeated $ parameters', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '$1 is the same as $1 but not $2',
    substitutions: ['THIS', 'THAT'],
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('THIS is the same as THIS but not THAT')
  })
})

test('String substitution - $ parameters contain further expressions', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: { $plus: ['May the $1', ' be with $2'] },
    substitutions: [
      {
        '$?': { condition: { $eq: [{ $plus: [50, 50] }, 100] }, ifTrue: 'Force', ifFalse: 'Forks' },
      },
      { $plus: ['y', 'o', 'u'] },
    ],
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('May the Force be with you')
  })
})

test('String substitution - $ parameters contain further expressions', () => {
  const expression = {
    operator: 'stringSub',
    string: '$1 $2 $3 $4',
    substitutions: {
      $plus: [
        ['One', 'Two'],
        ['Three', 'Four'],
      ],
    },
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('One Two Three Four')
  })
})

test('String substitution with white space trimming', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This is the *$1* entry and this is the $2',
    substitutions: [' first  ', '   second '],
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('This is the *first* entry and this is the second')
  })
})

test('String substitution with NO white space trimming', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This is the *$1* entry and this is the $2',
    substitutions: [' first  ', '   second '],
    trim: false,
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('This is the * first  * entry and this is the    second ')
  })
})

test('String substitution -- escape substitution chars (\\%1)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: `Only \\$1 of these should be replaced - $1`,
    substitutions: [' this one '],
    subChar: '$',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Only $1 of these should be replaced - this one')
  })
})

// Same again but with {{named}} substitutions

test('Simple string substitution (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'Hello, {{name}}, welcome to our site.',
    substitutions: { name: 'friend' },
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('Hello, friend, welcome to our site.')
  })
})

test('Simple string substitution - multiple replacements (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string:
      'There are {{first}} kinds of people in the world:\nthose who understand {{second}} and those who {{3rd}}',
    replacements: { first: '10', second: 'binary', '3rd': "don't" },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(
      "There are 10 kinds of people in the world:\nthose who understand binary and those who don't"
    )
  })
})

test('Named string substitution with pluralisation', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'Hi {{name}}, you have {{jackets}} and {{shoes}}',
    values: { name: 'Fred', jackets: 5, shoes: 1 },
    plurals: {
      jackets: { 1: '1 jacket', other: '{} jackets' },
      shoes: { 1: 'one pair of shoes', other: '{} pairs of shoes' },
    },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Hi Fred, you have 5 jackets and one pair of shoes')
  })
})

test('Named string substitution - non-string replacements', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'We have {{num}} {{type}} listed with an average value of {{val}}: {{array}}',
    values: { num: 2, type: 'people', val: 4.53, array: ['Boba', 'Mando'] },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('We have 2 people listed with an average value of 4.53: Boba,Mando')
  })
})

test('String substitution - too many replacements (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'The price of milk is {{price}} per {{unit}}',
    replacements: { price: '$2.30', unit: 'liter', somethingElse: 'gallon' },
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('The price of milk is $2.30 per liter')
  })
})

test('String substitution - too few replacements (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: "The applicant's name is _{{firstName}}_ {{lastName}} {{other}}.",
    values: { firstName: 'Wanda', lastName: 'Maximoff   ' },
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe("The applicant's name is _Wanda_ Maximoff .")
  })
})

test('String substitution - no parameters (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This sentence has no replacements.',
    substitutions: { something: 'NOTHING' },
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toBe('This sentence has no replacements.')
  })
})

test('String substitution - no replacements supplied (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'Your name is {{first}} {{last}} but we have nothing to replace them with',
    substitutions: {},
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Your name is   but we have nothing to replace them with')
  })
})

test('String substitution - some parameters empty strings (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'You like: {{blank}}{{cake}}{{candy}}',
    substitutions: { blank: '', cake: '\\n-Cake', candy: '\\n-Candy' },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('You like: \\n-Cake\\n-Candy')
  })
})

test('String substitution - repeated parameters (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: '{{this}} is the same as {{this}} but not {{that}}',
    substitutions: { this: 'THIS', that: 'THAT' },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('THIS is the same as THIS but not THAT')
  })
})

test('String substitution - parameters contain further expressions, using "buildObject" (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: { $plus: ['May the {{what}}', ' be with {{who}}'] },
    substitutions: {
      operator: 'buildObject',
      properties: [
        {
          key: 'what',
          value: {
            '$?': {
              condition: { $eq: [{ $plus: [50, 50] }, 100] },
              ifTrue: 'Force',
              ifFalse: 'Forks',
            },
          },
        },
        { key: 'who', value: { $plus: ['y', 'o', 'u'] } },
      ],
    },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('May the Force be with you')
  })
})

test('String substitution - parameters contain further expressions, using "evaluateFullObject" (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: { $plus: ['May the {{what}}', ' be with {{who}}'] },
    substitutions: {
      what: {
        '$?': {
          condition: { $eq: [{ $plus: [50, 50] }, 100] },
          ifTrue: 'Force',
          ifFalse: 'Forks',
        },
      },
      who: { $plus: ['y', 'o', 'u'] },
    },
  }
  return exp.evaluate(expression, { evaluateFullObject: true }).then((result) => {
    expect(result).toBe('May the Force be with you')
  })
})

test('String substitution with white space trimming (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This is the *{{one}}* entry and this is the {{two}}',
    substitutions: { one: ' first  ', two: '   second ' },
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('This is the *first* entry and this is the second')
  })
})

test('String substitution with NO white space trimming (Named substitutions)', () => {
  const expression = {
    operator: 'stringSubstitution',
    string: 'This is the *{{one}}* entry and this is the {{two}}',
    substitutions: { one: ' first  ', two: '   second ' },
    trim: false,
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('This is the * first  * entry and this is the    second ')
  })
})

test('String substitution -- escape substitution chars (\\{{}}) (Named substitutions)', async () => {
  const expression = {
    operator: 'stringSubstitution',
    string: `Only \\{{one}} of these should be replaced - {{one}}`,
    substitutions: { one: ' this one ' },
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe('Only {{one}} of these should be replaced - this one')
})

test('Named string substitution with number mapping', async () => {
  exp.updateOptions({ evaluateFullObject: true })
  const expression = {
    operator: 'stringSubstitution',
    string: 'Number of things: {{count}}',
    values: { count: { $plus: [1, 2, 3] } },
    numberMap: {
      count: { 0: 'None', '>10': 'Loads!', other: '{}', 10.5: 'exactly 10.5', '<3': 'Not many 🙁' },
    },
  }
  expect(await exp.evaluate(expression)).toBe('Number of things: 6')
  expect(await exp.evaluate({ ...expression, values: { count: 100 } })).toBe(
    'Number of things: Loads!'
  )
  expect(await exp.evaluate({ ...expression, values: { count: { $minus: [10, 10] } } })).toBe(
    'Number of things: None'
  )
  expect(await exp.evaluate({ ...expression, values: { count: { $plus: [10, 0.5] } } })).toBe(
    'Number of things: exactly 10.5'
  )
  expect(await exp.evaluate({ ...expression, values: { count: { $times: [4, 0.5] } } })).toBe(
    'Number of things: Not many 🙁'
  )
})
