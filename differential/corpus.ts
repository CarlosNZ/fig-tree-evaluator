/**
 * The differential's corpus ("The corpus" in
 * docs-dev/v3-specs/v3-converter.md): the cases in the tests of
 * fig-tree-evaluator 2.23.2 that evaluate an expression, in the order
 * the tests ran. Each holds the options v2 evaluated it with beyond the
 * runner's defaults (differential/case.ts).
 *
 * Extracted once, by differential/extract/, and kept by hand since: a new
 * case takes the next id, wherever it goes.
 */

import { readFileSync } from 'node:fs'
import type { Case, CaseOptions } from './case'

// An expression of 20,000 nodes, read from its file rather than held here
const massiveQuery: unknown = JSON.parse(readFileSync('test/massiveQuery.json', 'utf8'))

// 3_equality.test.ts
const options1: CaseOptions = { caseInsensitive: true }

// 8_objectProperties.test.ts
const options2: CaseOptions = {
  data: {
    user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
    organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
    form: { q1: 'Thor', q2: 'Asgard' },
    form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
    application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
    bigArray: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'],
  },
}

// 9_stringSubstitution.test.ts
const options3: CaseOptions = { evaluateFullObject: true }

// 9_stringSubstitution.test.ts
const options4: CaseOptions = {
  evaluateFullObject: true,
  data: { user: { name: 'Bruce', nickname: null } },
}

// 13_customFunctions.test.ts
const options5: CaseOptions = {
  functions: {
    fDouble: (...args) => args.map((e) => e + e),
    fDate: (dateString) => new Date(dateString),
    fNoArgs: () => 5 * 5,
    reverse: {
      function: (input) => {
        if (Array.isArray(input)) return [...input].reverse()
        return input.split('').reverse().join('')
      },
      description: 'Reverse a string or array',
      argsDefault: ['Reverse Me'],
    },
    getFullName: {
      function: (nameObject) => {
        return `${nameObject.firstName} ${nameObject.lastName}`
      },
      description: 'Combine first and last names',
      inputDefault: { firstName: 'First', lastName: 'Last' },
    },
  },
  data: {
    functions: { square: (x) => x ** 2, notAFunction: 'sorry' },
    user: { firstName: 'Mark', lastName: 'Hamill' },
  },
}

// 13_customFunctions.test.ts
const options6: CaseOptions = { functions: { fDate: (dateString) => new Date(dateString) } }

// 14_buildObject.test.ts
const options7: CaseOptions = { data: { key: 'keyFromObjects', value: 'valueFromObjects' } }

// 15_errorsAndFallbacks.test.ts
const options8: CaseOptions = {
  data: {
    user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
    organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
    form: { q1: 'Thor', q2: 'Asgard' },
    form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
    application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
  },
}

// 15_errorsAndFallbacks.test.ts
const options9: CaseOptions = {
  data: {
    user: 'Unknown',
    organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
    form: { q1: 'Thor', q2: 'Asgard' },
    form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
    application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
  },
}

// 17_complexExpressions.test.ts
const options10: CaseOptions = {
  functions: { getPrincess: (name) => `Princess ${name}` },
  fragments: { doubleLineBreak: { $plus: ['\n', '\n'] } },
  data: {
    randomWords: ['starfield', 'spaceships', 'planetary', ['DEATH STAR']],
    organisation: 'Galactic Empire',
    longSentence: {
      '🇨🇺': "Rebel spies managed to steal secret plans to the Empire's ultimate weapon",
    },
    Oceania: { NZ: { Wellington: 'stolen plans that can save her people' } },
  },
}

// 17_complexExpressions.test.ts
const options11: CaseOptions = {
  functions: { getPrincess: (name) => `Princess ${name}` },
  fragments: { doubleLineBreak: { $plus: ['\n', '\n'] } },
  data: {
    randomWords: ['starfield', 'spaceships', 'planetary', ['DEATH STAR']],
    organisation: 'Galactic Empire',
    longSentence: {
      '🇨🇺': "Rebel spies managed to steal secret plans to the Empire's ultimate weapon",
    },
    Oceania: { NZ: { Wellington: 'stolen plans that can save her people' } },
  },
  evaluateFullObject: true,
}

// 20_match.test.ts
const options12: CaseOptions = { data: { weather: 'rainy', humidity: 'high', wind: 'strong' } }

// 21_evaluateWholeObject.test.ts
const options13: CaseOptions = {
  evaluateFullObject: true,
  data: {
    user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
    organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
    form: { q1: 'Thor', q2: 'Asgard' },
    form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
    application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
  },
}

// 22_fragments.test.ts
const options14: CaseOptions = {
  fragments: {
    falsy: false,
    falsy2: null,
    falsy3: '',
    falsy4: 0,
    truthy: true,
    addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
    weatherMatcher: {
      operator: 'match',
      children: [
        { operator: 'objectProperties', property: 'weather' },
        'sunny',
        {
          operator: 'match',
          matchExpression: { operator: 'objProps', property: 'humidity' },
          high: 'NO',
          normal: 'YES',
        },
        'cloudy',
        'YES',
        'rainy',
        {
          operator: 'match',
          matchExpression: { operator: 'objProps', property: 'wind' },
          branches: ['strong', 'NO', 'weak', 'YES'],
        },
      ],
    },
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
      metadata: {
        parameters: [{ name: '$country', type: 'string', required: true, default: 'New Zealand' }],
      },
    },
    simpleFragment: 'The flag of Brazil is: ',
    adder: { operator: '+', values: '$values' },
  },
  data: { myCountry: 'Brazil' },
}

// 22_fragments.test.ts
const options15: CaseOptions = {
  fragments: {
    getCountryData: {
      operator: 'GET',
      url: {
        operator: 'stringSubstitution',
        string: 'https://restcountries.com/v3.1/name/%1',
        replacements: ['$country'],
      },
      returnProperty: { operator: '+', values: ['[0].', '$field'] },
    },
    falsy: false,
    falsy2: null,
    falsy3: '',
    falsy4: 0,
    truthy: true,
    addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
    weatherMatcher: {
      operator: 'match',
      children: [
        { operator: 'objectProperties', property: 'weather' },
        'sunny',
        {
          operator: 'match',
          matchExpression: { operator: 'objProps', property: 'humidity' },
          high: 'NO',
          normal: 'YES',
        },
        'cloudy',
        'YES',
        'rainy',
        {
          operator: 'match',
          matchExpression: { operator: 'objProps', property: 'wind' },
          branches: ['strong', 'NO', 'weak', 'YES'],
        },
      ],
    },
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
      metadata: {
        parameters: [{ name: '$country', type: 'string', required: true, default: 'New Zealand' }],
      },
    },
    simpleFragment: 'The flag of Brazil is: ',
    adder: { operator: '+', values: '$values' },
  },
  data: { myCountry: 'Brazil' },
}

// 23_shorthand.test.ts
const options16: CaseOptions = {
  functions: { getPrincess: (name) => `Princess ${name}` },
  fragments: {
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
    },
    simpleFragment: 'The flag of Brazil is: ',
    adder: { operator: '+', values: '$values' },
    shorthandFragment: { $stringSubstitution: ['My name is %1', '$name'] },
  },
  data: {
    myCountry: 'Brazil',
    otherCountry: 'France',
    deep: { p: 12 },
    user: { firstName: 'Bruce', lastName: 'Banner' },
  },
}

// 23_shorthand.test.ts
const options17: CaseOptions = {
  functions: { getPrincess: (name) => `Princess ${name}` },
  fragments: {
    getCountryData: {
      operator: 'GET',
      url: {
        operator: 'stringSubstitution',
        string: 'https://restcountries.com/v3.1/name/%1',
        replacements: ['$country'],
      },
      returnProperty: { operator: '+', values: ['[0].', '$field'] },
    },
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
    },
    simpleFragment: 'The flag of Brazil is: ',
    adder: { operator: '+', values: '$values' },
    shorthandFragment: { $stringSubstitution: ['My name is %1', '$name'] },
  },
  data: {
    myCountry: 'Brazil',
    otherCountry: 'France',
    deep: { p: 12 },
    user: { firstName: 'Bruce', lastName: 'Banner' },
  },
}

// 26_convert.test.ts
const options18: CaseOptions = {
  functions: {
    random: () => Math.random(),
    square: (n) => n * n,
    getSomething: (a, b) => a + b,
    reverse: {
      function: (input) => {
        if (Array.isArray(input)) return [...input].reverse()
        return input.split('').reverse().join('')
      },
      description: 'Reverse a string or array',
      argsDefault: ['Reverse Me'],
    },
    fDouble: (...args) => args.map((e) => e + e),
    getFullName: (nameObject) => {
      return `${nameObject.firstName} ${nameObject.lastName}`
    },
    changeCase: {
      function: ({ string, toCase }) =>
        toCase === 'upper' ? string.toUpperCase() : string.toLowerCase(),
      description: 'Convert a string to either upper or lower case',
      inputDefault: { string: 'New string', toCase: 'upper' },
    },
    currentDate: {
      function: () => new Date().toLocaleDateString(),
      description: "Returns today's date in local format",
    },
  },
  fragments: {
    getCapital: {
      operator: 'GET',
      url: {
        operator: 'stringSubstitution',
        string: 'https://restcountries.com/v3.1/name/%1',
        replacements: ['$country'],
      },
      returnProperty: '[0].capital',
      outputType: 'string',
      metadata: {
        description: "Gets a country's capital city",
        parameters: [{ name: '$country', type: 'string', required: true }],
      },
    },
    'Frag With Spaces': { operator: 'plus', values: '$values' },
    FragWithoutSpaces: { operator: 'plus', values: '$values' },
    getRandom: { $function: 'random' },
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
    },
    adder: { operator: '+', values: '$values' },
  },
  data: {
    applicationData: { applicationSerial: 'X12345', firstName: 'Tom', lastName: 'Holland' },
    film: { title: 'Deadpool & Wolverine', minAgeRating: 17 },
    patron: { age: 12, isParentAttending: true },
    myCountry: 'Morocco',
    backwardsInput: " :si etad s'yadoT",
    toCase: 'upper',
  },
}

export const corpus: Case[] = [
  { id: 1, from: '1_simpleValues.test.ts › String literal', expression: 'Just a string' },
  { id: 2, from: '1_simpleValues.test.ts › Boolean', expression: true },
  {
    id: 3,
    from: '1_simpleValues.test.ts › Array',
    expression: ['Pharmaceutical', 'Natural Product', 'Other'],
  },
  { id: 4, from: '1_simpleValues.test.ts › Number', expression: 666 },
  {
    id: 5,
    from: '1_simpleValues.test.ts › Object',
    expression: { '6': [1, 2, 3], one: 1, two: 'two', three: null, four: undefined, five: true },
  },
  { id: 6, from: '1_simpleValues.test.ts › Null', expression: null },
  { id: 7, from: '1_simpleValues.test.ts › Undefined', expression: undefined },
  {
    id: 8,
    from: '2_logicalOperators.test.ts › AND operator with 2 children',
    expression: { operator: 'and', children: [true, true] },
  },
  {
    id: 9,
    from: '2_logicalOperators.test.ts › AND operator with 2 children, one false',
    expression: { operator: 'AND', values: [true, false] },
  },
  {
    id: 10,
    from: '2_logicalOperators.test.ts › AND operator with 4 children, 1 nested',
    expression: {
      operator: '__AND__',
      values: [true, true, true, { operator: 'AND', children: [true, true] }],
    },
  },
  {
    id: 11,
    from: '2_logicalOperators.test.ts › AND operator with 4 children, 1 false, 2 nested',
    expression: {
      operator: 'and_',
      children: [true, true, true, { operator: 'AND', values: [false, true] }],
    },
  },
  {
    id: 12,
    from: '2_logicalOperators.test.ts › OR operator with 2 children',
    expression: { operator: 'Or', children: [true, true] },
  },
  {
    id: 13,
    from: '2_logicalOperators.test.ts › OR operator with 2 children, one false',
    expression: { operator: 'OR', values: [true, false] },
  },
  {
    id: 14,
    from: '2_logicalOperators.test.ts › OR operator with 4 children, 2 nested',
    expression: {
      operator: 'OR',
      values: [
        true,
        { operator: 'AND', children: [false, true] },
        { operator: 'And', children: [true, true] },
        false,
      ],
    },
  },
  {
    id: 15,
    from: '2_logicalOperators.test.ts › OR operator with 4 children, all false',
    expression: {
      operator: 'OR',
      values: [
        false,
        { operator: 'AND', children: [false, true] },
        { operator: 'Or', children: [false, false] },
        false,
      ],
    },
  },
  {
    id: 16,
    from: '2_logicalOperators.test.ts › OR - Non-boolean operands - OR',
    expression: { operator: 'OR', values: ['this', 'that'] },
  },
  {
    id: 17,
    from: '2_logicalOperators.test.ts › AND - Non-boolean operands',
    expression: { operator: 'AND', values: ['this', 'that'] },
  },
  {
    id: 18,
    from: '2_logicalOperators.test.ts › OR - Non-boolean falsy operands',
    expression: { operator: 'OR', values: [false, null, undefined, NaN, 0, ''] },
  },
  {
    id: 19,
    from: '2_logicalOperators.test.ts › OR - Non-boolean operands, only one truthy',
    expression: { operator: 'OR', values: [false, null, 'Not falsy', undefined, NaN, 0, ''] },
  },
  {
    id: 20,
    from: '3_equality.test.ts › Equality (numbers)',
    expression: { operator: '=', children: [100, 100] },
  },
  {
    id: 21,
    from: '3_equality.test.ts › Equality (numbers, different)',
    expression: { operator: 'eq', values: [5, -5] },
  },
  {
    id: 22,
    from: '3_equality.test.ts › Equality (strings)',
    expression: { operator: 'Equal', values: ['Monday', 'Monday'] },
  },
  {
    id: 23,
    from: "3_equality.test.ts › Equality (strings) -- don't match",
    expression: { operator: 'Equal', children: ['Monday', 'Tuesday'] },
  },
  {
    id: 24,
    from: '3_equality.test.ts › Equality (strings, case insensitive)',
    expression: { operator: 'Equal', values: ['MonDay', 'monDAY'], caseInsensitive: true },
  },
  {
    id: 25,
    from: "3_equality.test.ts › Equality (strings, case insensitive, don't match)",
    expression: { operator: 'Equal', values: ['MoonDay', 'monDAY'], caseInsensitive: true },
  },
  {
    id: 26,
    from: '3_equality.test.ts › Equality (strings, case insensitive set with options)',
    expression: { operator: 'Equal', values: ['MonDay', 'monDAY'], caseInsensitive: true },
    options: options1,
  },
  {
    id: 27,
    from: '3_equality.test.ts › Equality (strings, case insensitive set with options, overridden in expression)',
    expression: { operator: 'Equal', values: ['MonDay', 'monDAY'], caseInsensitive: false },
    options: options1,
  },
  {
    id: 28,
    from: "3_equality.test.ts › Equality (strings) -- case sensitive, don't match",
    expression: { operator: 'Equal', children: ['MonDay', 'monDAY'], caseSensitive: true },
  },
  {
    id: 29,
    from: '3_equality.test.ts › Equality (numbers, many)',
    expression: { operator: 'EQUAL', children: [99, 99, 99, 99, 99] },
  },
  {
    id: 30,
    from: '3_equality.test.ts › Equality (string, single child)',
    expression: { operator: '=', values: ['All by myself'] },
  },
  {
    id: 31,
    from: '3_equality.test.ts › Equality (booleans, nested)',
    expression: {
      operator: 'equals',
      children: [
        { operator: 'And', values: [true, false] },
        { operator: 'OR', children: [false, false] },
      ],
    },
  },
  {
    id: 32,
    from: '3_equality.test.ts › Equality (booleans, nested, not equal)',
    expression: {
      operator: 'EQ',
      children: [
        { operator: 'And', children: [false, false] },
        { operator: 'OR', children: [false, true] },
      ],
    },
  },
  {
    id: 33,
    from: '3_equality.test.ts › Equality (objects)',
    expression: {
      operator: '=',
      values: [
        {
          user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
          organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
          form: { q1: 'Thor', q2: 'Asgard' },
          form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
          application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
        },
        {
          operator: '+',
          values: [
            { user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' } },
            {
              organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
              form: { q1: 'Thor', q2: 'Asgard' },
              form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
              application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
            },
          ],
        },
      ],
    },
  },
  {
    id: 34,
    from: '3_equality.test.ts › Equality (objects, not matching)',
    expression: {
      operator: '=',
      values: [
        {
          user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
          organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
          form: { q1: 'Thor', q2: 'Asgard' },
          form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
          application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
        },
        {
          user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
          organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
          form: { q1: 'Thor', q2: 'Asgard' },
          form2: { q1: 'Company Application', q2: 'XYZ Chemicals' },
          application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
        },
      ],
    },
  },
  {
    id: 35,
    from: '3_equality.test.ts › Equality (arrays, multiple)',
    expression: {
      operator: '=',
      values: [
        [1, 2, 3, { propOne: 'ONE' }],
        [1, 2, 3, { propOne: 'ONE' }],
        { operator: '+', type: 'array', children: [1, 2, 3, { propOne: 'ONE' }] },
      ],
    },
  },
  {
    id: 36,
    from: '3_equality.test.ts › Equality (arrays, not matching)',
    expression: {
      operator: '=',
      values: [
        [1, 2, 3, { propOne: 'ONE' }],
        [1, 2, 3, { propOne: 'ONE', propTwo: 'TWO' }],
      ],
    },
  },
  {
    id: 37,
    from: '3_equality.test.ts › Equality -- missing values',
    expression: { operator: '=' },
  },
  {
    id: 38,
    from: '3_equality.test.ts › Inequality (numbers)',
    expression: { operator: '!=', children: [3.14, 3.141592653589793] },
  },
  {
    id: 39,
    from: '3_equality.test.ts › Inequality (numbers) -- false',
    expression: { operator: '!', children: [666, 666] },
  },
  {
    id: 40,
    from: '3_equality.test.ts › Inequality (strings)',
    expression: { operator: 'ne', values: ['this', 'is not that'] },
  },
  {
    id: 41,
    from: '3_equality.test.ts › Inequality (strings, false)',
    expression: { operator: 'NOT_EQUAL', children: ['Matching', 'Matching'] },
  },
  {
    id: 42,
    from: '3_equality.test.ts › Inequality (strings, case insensitive)',
    expression: { operator: 'ne', values: ['one', 'OnE'], caseInsensitive: true },
  },
  {
    id: 43,
    from: '3_equality.test.ts › Inequality (strings, false, case insensitive set in options)',
    expression: { operator: 'NOT_EQUAL', children: ['Matching', 'Matching', 'matching'] },
    options: options1,
  },
  {
    id: 44,
    from: '3_equality.test.ts › Inequality (boolean, nested)',
    expression: {
      operator: 'not_equal',
      children: [
        { operator: 'and', children: [false, false] },
        { operator: 'or', children: [false, { operator: 'AND', values: [true, true] }] },
      ],
    },
  },
  {
    id: 45,
    from: '3_equality.test.ts › Inequality (multiple, nested, all equal)',
    expression: {
      operator: 'not_equal',
      children: [
        { operator: '+', values: [5, 5] },
        10,
        { operator: 'substitute', string: '%1%2', replacements: ['1', '0'], type: 'number' },
        10,
        10,
      ],
    },
  },
  {
    id: 46,
    from: '3_equality.test.ts › Inequality (multiple, all different)',
    expression: { operator: 'ne', children: [1, 2, 3, 4, 5] },
  },
  {
    id: 47,
    from: '3_equality.test.ts › Inequality (multiple, only first different)',
    expression: { operator: 'ne', children: ['A', 'B', 'B', 'B', 'B'] },
  },
  {
    id: 48,
    from: '3_equality.test.ts › Inequality (multiple, one different)',
    expression: { operator: 'ne', children: ['B', 'B', 'other', 'B', 'B'] },
  },
  {
    id: 49,
    from: '3_equality.test.ts › Inequality (only one value)',
    expression: { operator: 'ne', children: ['ONE'] },
  },
  {
    id: 50,
    from: '3_equality.test.ts › Inequality -- missing values',
    expression: { operator: '!=' },
  },
  {
    id: 51,
    from: '3_equality.test.ts › Inequality (nullEqualsUndefined, null vs number)',
    expression: { operator: '!=', values: [null, 5], nullEqualsUndefined: true },
  },
  {
    id: 52,
    from: '3_equality.test.ts › Inequality (nullEqualsUndefined, undefined vs number)',
    expression: { operator: '!=', values: [undefined, 'hello'], nullEqualsUndefined: true },
  },
  {
    id: 53,
    from: '3_equality.test.ts › Inequality (nullEqualsUndefined, null vs undefined)',
    expression: { operator: '!=', values: [null, undefined], nullEqualsUndefined: true },
  },
  {
    id: 54,
    from: '3_equality.test.ts › Inequality (nullEqualsUndefined, all null/undefined)',
    expression: { operator: '!=', values: [null, undefined, null], nullEqualsUndefined: true },
  },
  {
    id: 55,
    from: '4_plus.test.ts › Adding 2 numbers',
    expression: { operator: '+', children: [6, 6] },
  },
  {
    id: 56,
    from: '4_plus.test.ts › Adding 4 numbers',
    expression: { operator: 'Plus', children: [7.5, 25, -0.1, 6] },
  },
  {
    id: 57,
    from: '4_plus.test.ts › Concatenate 2 Arrays',
    expression: {
      operator: 'concat',
      children: [
        [1, 2, 3],
        ['Four', 'Five', 'Six'],
      ],
    },
  },
  {
    id: 58,
    from: '4_plus.test.ts › Concatenate 4 Arrays, including nested',
    expression: {
      operator: 'join',
      children: [
        [1, 2, 3],
        ['Four', 'Five', 'Six'],
        [7, 8, 'Nine'],
        [['Four', 'Five', 'Six'], 'The', 'End'],
      ],
    },
  },
  {
    id: 59,
    from: '4_plus.test.ts › Concatenate 3 Strings',
    expression: { operator: 'CONCAT', children: ['Tony', ' ', 'Stark'] },
  },
  {
    id: 60,
    from: '4_plus.test.ts › Concatenate Strings, output as Array',
    expression: { operator: 'add', type: 'array', values: ['One', 'Two', 'Three'] },
  },
  {
    id: 61,
    from: '4_plus.test.ts › Merge 2 objects',
    expression: {
      operator: 'Merge',
      children: [
        { one: 1, two: '2', three: false },
        { four: [1, 2, 3], five: true },
      ],
    },
  },
  {
    id: 62,
    from: '4_plus.test.ts › Merge 3 objects',
    expression: {
      operator: '+',
      children: [
        { one: 1, two: '2', three: undefined },
        { four: [1, 2, 3], five: true },
        { '1': null, '2': 'TRUE' },
      ],
    },
  },
  { id: 63, from: '4_plus.test.ts › Missing values', expression: { operator: '+' } },
  {
    id: 64,
    from: '4_plus.test.ts › Empty values array',
    expression: { operator: '+', values: [] },
  },
  {
    id: 65,
    from: '5_otherArithmetic.test.ts › MINUS operator simple integer subtraction',
    expression: { operator: 'minus', values: [9, 6] },
  },
  {
    id: 66,
    from: '5_otherArithmetic.test.ts › MINUS operator simple integer subtraction with children',
    expression: { operator: '-', children: [100, 76] },
  },
  {
    id: 67,
    from: '5_otherArithmetic.test.ts › MINUS operator simple integer subtraction using properties',
    expression: { operator: '-', subtract: 76, from: 100 },
  },
  {
    id: 68,
    from: '5_otherArithmetic.test.ts › MINUS operator simple subtraction with negative result',
    expression: { operator: '-', values: [66, 99] },
  },
  {
    id: 69,
    from: '5_otherArithmetic.test.ts › MINUS operator with non integers',
    expression: { operator: '-', subtract: 4.1, subtractFrom: 10.5 },
  },
  {
    id: 70,
    from: '5_otherArithmetic.test.ts › MINUS operator subtract floats with negative result',
    expression: { operator: 'subtract', values: [0.3, 49.777] },
  },
  {
    id: 71,
    from: '5_otherArithmetic.test.ts › MINUS operator with one NaN operand',
    expression: { operator: '-', values: [0.3, 'five'] },
  },
  {
    id: 72,
    from: '5_otherArithmetic.test.ts › MINUS operator with not enough values',
    expression: { operator: '-', values: [0.3] },
  },
  {
    id: 73,
    from: '5_otherArithmetic.test.ts › MINUS operator with missing "from" property',
    expression: { operator: '-', subtract: 0.3 },
  },
  {
    id: 74,
    from: '5_otherArithmetic.test.ts › MINUS operator with missing "subtract" property',
    expression: { operator: '-', from: 10 },
  },
  {
    id: 75,
    from: '5_otherArithmetic.test.ts › MULTIPLY operator 2 values',
    expression: { operator: 'Multiply', values: [2, 4] },
  },
  {
    id: 76,
    from: '5_otherArithmetic.test.ts › MULTIPLY operator multiple values',
    expression: { operator: '*', values: [7, 3, 99] },
  },
  {
    id: 77,
    from: '5_otherArithmetic.test.ts › MULTIPLY operator single value',
    expression: { operator: 'x', values: [6.5] },
  },
  {
    id: 78,
    from: '5_otherArithmetic.test.ts › MULTIPLY operator with children',
    expression: { operator: 'TIMES', children: [8.5, 6, 12] },
  },
  {
    id: 79,
    from: '5_otherArithmetic.test.ts › MULTIPLY operator with non-number inputs',
    expression: { operator: 'X', values: [17, 'twelve'] },
  },
  {
    id: 80,
    from: '5_otherArithmetic.test.ts › MULTIPLY - Missing values',
    expression: { operator: '*' },
  },
  {
    id: 81,
    from: '5_otherArithmetic.test.ts › MULTIPLY - Empty values array',
    expression: { operator: '*', values: [] },
  },
  {
    id: 82,
    from: '5_otherArithmetic.test.ts › DIVIDE operator simple integers',
    expression: { operator: 'divide', values: [60, 20] },
  },
  {
    id: 83,
    from: '5_otherArithmetic.test.ts › DIVIDE operator simple integers with children',
    expression: { operator: '/', children: [99, 9] },
  },
  {
    id: 84,
    from: '5_otherArithmetic.test.ts › DIVIDE operator simple integer division using properties',
    expression: { operator: '/', dividend: 150, divisor: 4 },
  },
  {
    id: 85,
    from: '5_otherArithmetic.test.ts › DIVIDE operator, alias properties with quotient only',
    expression: { operator: '/', divide: 145, by: 3, output: 'quotient' },
  },
  {
    id: 86,
    from: '5_otherArithmetic.test.ts › DIVIDE operator, alias properties with remainder only',
    expression: { operator: '/', divide: 145, by: 3, output: 'remainder' },
  },
  {
    id: 87,
    from: '5_otherArithmetic.test.ts › DIVIDE operator with fractional result',
    expression: { operator: '÷', values: [100, 3] },
  },
  {
    id: 88,
    from: '5_otherArithmetic.test.ts › DIVIDE operator with explicit decimal output',
    expression: { operator: '/', values: [10, 4], output: 'decimal' },
  },
  {
    id: 89,
    from: '5_otherArithmetic.test.ts › DIVIDE - division by zero',
    expression: { operator: '/', dividend: 69, divisor: { operator: '-', values: [6, 6] } },
  },
  {
    id: 90,
    from: '5_otherArithmetic.test.ts › DIVIDE operator with one NaN operand',
    expression: { operator: '/', values: [0.3, 'five'] },
  },
  {
    id: 91,
    from: '5_otherArithmetic.test.ts › DIVIDE operator with not enough values',
    expression: { operator: '/', children: [99] },
  },
  {
    id: 92,
    from: '5_otherArithmetic.test.ts › DIVIDE operator with Evaluator node values',
    expression: {
      operator: '÷',
      values: [
        { operator: '+', values: [70, 20] },
        { operator: '+', values: [1, 1, 1] },
      ],
    },
  },
  {
    id: 93,
    from: '5_otherArithmetic.test.ts › Greater than - integer comparison',
    expression: { operator: 'greaterThan', values: [5, 3] },
  },
  {
    id: 94,
    from: '5_otherArithmetic.test.ts › Greater than - string comparison',
    expression: { operator: 'greaterThan', values: ['Large', 'Small'] },
  },
  {
    id: 95,
    from: '5_otherArithmetic.test.ts › Greater than - equal vals, strictly greater',
    expression: { operator: '>', children: [99.5, 99.5] },
  },
  {
    id: 96,
    from: '5_otherArithmetic.test.ts › Greater than - equal vals, non-strict',
    expression: { operator: '>', values: [99.5, 99.5], strict: false },
  },
  {
    id: 97,
    from: '5_otherArithmetic.test.ts › Greater than - equal vals, strictly greater strings',
    expression: { operator: '>', children: ['99.5, 99.5', '99.5, 99.5'] },
  },
  {
    id: 98,
    from: '5_otherArithmetic.test.ts › Greater than - equal vals, non-strict strings',
    expression: {
      operator: 'larger',
      children: ['One', 'One'],
      strict: { operator: 'AND', values: [true, false] },
    },
  },
  {
    id: 99,
    from: '5_otherArithmetic.test.ts › Greater than - missing values',
    expression: { operator: '>' },
  },
  {
    id: 100,
    from: '5_otherArithmetic.test.ts › Greater than - not enough values',
    expression: { operator: '>', values: [12] },
  },
  {
    id: 101,
    from: '5_otherArithmetic.test.ts › Less than - integer comparison',
    expression: { operator: 'lessThan', values: [5, 3] },
  },
  {
    id: 102,
    from: '5_otherArithmetic.test.ts › Less than - string comparison',
    expression: { operator: 'lessThan', values: ['Large', 'Small'] },
  },
  {
    id: 103,
    from: '5_otherArithmetic.test.ts › Less than - equal vals, strictly smaller',
    expression: { operator: '<', children: [99.5, 99.5] },
  },
  {
    id: 104,
    from: '5_otherArithmetic.test.ts › Less than - equal vals, non-strict',
    expression: { operator: '<', values: [99.5, 99.5], strict: false },
  },
  {
    id: 105,
    from: '5_otherArithmetic.test.ts › Less than - equal vals, strictly smaller strings',
    expression: { operator: '<', children: ['99.5, 99.5', '99.5, 99.5'] },
  },
  {
    id: 106,
    from: '5_otherArithmetic.test.ts › Less than - equal vals, non-strict strings',
    expression: {
      operator: 'smaller',
      children: ['One', 'One'],
      strict: { operator: 'OR', values: [false, false] },
    },
  },
  {
    id: 107,
    from: '5_otherArithmetic.test.ts › Less than - missing values',
    expression: { operator: '<' },
  },
  {
    id: 108,
    from: '5_otherArithmetic.test.ts › Less than - Empty values array',
    expression: { operator: '<', values: [] },
  },
  {
    id: 109,
    from: '5_otherArithmetic.test.ts › Count - simple array',
    expression: { operator: 'count', values: [1, 2, 3] },
  },
  {
    id: 110,
    from: '5_otherArithmetic.test.ts › Count - simple array using children',
    expression: { operator: 'count', children: ['a', 'b', { $plus: [1, 2, 3] }] },
  },
  {
    id: 111,
    from: '5_otherArithmetic.test.ts › Count - simple array using children, with operator node that returns an array',
    expression: { operator: 'count', children: { $pass: [1, 2, 3] } },
  },
  {
    id: 112,
    from: '5_otherArithmetic.test.ts › Count - empty array',
    expression: { operator: 'length', children: [] },
  },
  {
    id: 113,
    from: '5_otherArithmetic.test.ts › Count - values not an array',
    expression: { operator: 'length', values: 'Wrong' },
  },
  {
    id: 114,
    from: '5_otherArithmetic.test.ts › Count - missing values',
    expression: { operator: 'Count' },
  },
  {
    id: 115,
    from: '5_otherArithmetic.test.ts › Combine arithmetic operators',
    expression: {
      operator: '+',
      values: {
        operator: 'join',
        children: [
          {
            operator: '-',
            subtract: { operator: 'count', values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
            from: 10,
            outputType: {
              operator: '?',
              condition: { operator: '>', values: ['Book', 'Apple'] },
              valueIfTrue: 'array',
              valueIfFalse: 'string',
            },
          },
          {
            operator: '*',
            children: [0.5, { operator: '/', output: 'remainder', values: [48, 10] }, 0.5],
            outputType: 'array',
          },
          { operator: '/', divide: 81, by: 9, outputType: 'array' },
        ],
      },
    },
  },
  {
    id: 116,
    from: '6_conditional.test.ts › Basic conditional',
    expression: { operator: '?', children: [true, 'A', 'B'] },
  },
  {
    id: 117,
    from: '6_conditional.test.ts › Conditional with Addition',
    expression: {
      operator: 'conditional',
      children: [
        { operator: '=', children: [{ operator: '+', children: [7.5, 19] }, 26.5] },
        'Correct',
        'Wrong',
      ],
    },
  },
  {
    id: 118,
    from: '6_conditional.test.ts › Conditional with Logical Expression (using properties)',
    expression: {
      operator: 'if-then',
      condition: {
        operator: 'and',
        children: [
          { operator: '=', values: [{ operator: '+', children: [7.5, 19] }, 26.5] },
          { operator: '!=', values: ['five', 'four'] },
        ],
      },
      valueIfTrue: 'Expression is True',
      valueIfFalse: 'Expression is False',
    },
  },
  {
    id: 119,
    from: '6_conditional.test.ts › Conditional with Logical Expression (using aliased properties)',
    expression: {
      operator: 'if-then',
      condition: {
        operator: 'and',
        children: [
          { operator: '=', values: [{ operator: '+', children: [7.5, 19] }, 26.5] },
          { operator: '!=', values: ['five', 'four'] },
        ],
      },
      ifTrue: 'Expression is True',
      ifFalse: 'Expression is False',
    },
  },
  {
    id: 120,
    from: '6_conditional.test.ts › Conditional with False Logical Expression',
    expression: {
      operator: '?',
      children: [
        {
          operator: 'Or',
          children: [
            { operator: 'eq', children: [{ operator: '+', children: [7, 19] }, 26.5] },
            { operator: 'NotEqual', children: ['five', 'five'] },
          ],
        },
        'Expression is True',
        'Expression is False',
      ],
    },
  },
  {
    id: 121,
    from: '6_conditional.test.ts › Conditional -- missing parameters',
    expression: { operator: '?' },
  },
  {
    id: 122,
    from: '6_conditional.test.ts › Conditional -- 1 missing parameter (error as string)',
    expression: { operator: '?', condition: 'YES', valueIfFalse: 'NO' },
  },
  {
    id: 123,
    from: '6_conditional.test.ts › Conditional -- condition is Truthy',
    expression: { operator: '?', condition: 'YES', valueIfTrue: 'YES', valueIfFalse: 'NO' },
  },
  {
    id: 124,
    from: '6_conditional.test.ts › Conditional -- condition is Falsy',
    expression: { operator: '?', condition: 0, valueIfTrue: 'YES', valueIfFalse: 'NO' },
  },
  {
    id: 125,
    from: '7_regex.test.ts › Testing Regex - Email validation',
    expression: {
      operator: 'REGEX',
      children: ['info@somwhere.net', '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$'],
    },
  },
  {
    id: 126,
    from: '7_regex.test.ts › Testing Regex - Email validation false, using properties',
    expression: {
      operator: 'pattern-match',
      pattern: '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$',
      testString: 'info@wherever$net',
    },
  },
  {
    id: 127,
    from: '8_objectProperties.test.ts › Object properties - single property',
    expression: { operator: 'objectProperties', children: ['user.firstName'] },
    options: options2,
  },
  {
    id: 128,
    from: '8_objectProperties.test.ts › Object properties, deeper, using properties',
    expression: { operator: 'getProperty', property: 'application.questions.q2' },
    options: options2,
  },
  {
    id: 129,
    from: '8_objectProperties.test.ts › Object properties, get from long array',
    expression: { operator: 'getProperty', property: 'bigArray[12]' },
    options: options2,
  },
  {
    id: 130,
    from: '8_objectProperties.test.ts › Object properties, array out of bounds',
    expression: {
      operator: 'getProperty',
      property: 'vehicle.model.versions[4]',
      data: {
        vehicle: {
          make: 'Honda',
          model: { name: 'Accord', versions: ['Type A', 'Type B', 'Type C'] },
        },
      },
      fallback: 'Too big',
    },
    options: options2,
  },
  {
    id: 131,
    from: '8_objectProperties.test.ts › Object properties, first level, object passed into instance',
    expression: { operator: 'get_obj_prop', path: 'name' },
    options: {
      data: {
        user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
        organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
        form: { q1: 'Thor', q2: 'Asgard' },
        form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
        application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
        bigArray: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'],
        name: 'Wanda',
      },
    },
  },
  {
    id: 132,
    from: '8_objectProperties.test.ts › Object properties, unresolved path',
    expression: { operator: 'objectProperties', children: ['application.questions.q5'] },
    options: options2,
  },
  {
    id: 133,
    from: '8_objectProperties.test.ts › Object properties, unresolved path with Null fallback',
    expression: {
      operator: 'objectProperties',
      property: 'application.querstions.q2.go.even.deeper',
      fallback: null,
    },
    options: options2,
  },
  {
    id: 134,
    from: '8_objectProperties.test.ts › Object properties, unresolved path with Null fallback (using children)',
    expression: {
      operator: 'objectProperties',
      children: ['application.querstions.q2.go.even.deeper', null],
    },
    options: options2,
  },
  {
    id: 135,
    from: '8_objectProperties.test.ts › Object properties, unresolved path (first level) with fallback',
    expression: { operator: 'objectProperties', path: 'cantFind', fallback: 'Sorry 🤷‍♂️' },
    options: options2,
  },
  {
    id: 136,
    from: '8_objectProperties.test.ts › Object properties with additional objects',
    expression: {
      operator: 'objectProperties',
      path: 'newThing.first',
      additionalObjects: { newThing: { first: 'A New Value' } },
    },
    options: options2,
  },
  {
    id: 137,
    from: '8_objectProperties.test.ts › Object properties with more complex additional objects',
    expression: {
      operator: 'objectProperties',
      path: 'vehicle.model.versions[2]',
      additionalData: {
        vehicle: {
          make: 'Honda',
          model: { name: 'Accord', versions: ['Type A', 'Type B', 'Type C'] },
        },
      },
    },
    options: options2,
  },
  {
    id: 138,
    from: '8_objectProperties.test.ts › Object properties with additionalData as array',
    expression: {
      operator: 'objectProperties',
      path: '[0]vehicle.make',
      additionalData: [
        {
          vehicle: {
            make: 'Honda',
            model: { name: 'Accord', versions: ['Type A', 'Type B', 'Type C'] },
          },
        },
      ],
    },
    options: options2,
  },
  {
    id: 139,
    from: '8_objectProperties.test.ts › Object properties with additional objects, fallback',
    expression: {
      operator: 'objectProperties',
      path: 'vehicle.model.versions[3]',
      additional: {
        vehicle: {
          make: 'Honda',
          model: { name: 'Accord', versions: ['Type A', 'Type B', 'Type C'] },
        },
      },
      fallback: 'Nope',
    },
    options: options2,
  },
  {
    id: 140,
    from: '8_objectProperties.test.ts › Object properties dynamically-built additionalObject',
    expression: {
      operator: 'objectProperties',
      path: 'second',
      objects: {
        operator: 'buildObject',
        values: [
          { key: 'first', value: 1 },
          { key: 'second', value: 100 },
        ],
      },
    },
    options: options2,
  },
  {
    id: 141,
    from: '9_stringSubstitution.test.ts › Simple string substitution',
    expression: {
      operator: 'stringSubstitution',
      children: ['Hello, %1, welcome to our site.', 'friend'],
    },
  },
  {
    id: 142,
    from: '9_stringSubstitution.test.ts › Simple string substitution - multiple replacements',
    expression: {
      operator: 'stringSubstitution',
      children: [
        'There are %1 kinds of people in the world:\nthose who understand %2 and those who %3',
        '10',
        'binary',
        "don't",
      ],
    },
  },
  {
    id: 143,
    from: '9_stringSubstitution.test.ts › String substitution - non-string replacements',
    expression: {
      operator: 'stringSubstitution',
      children: [
        'We have %1 %2 listed with an average value of %3: %4',
        2,
        'people',
        4.53,
        ['Boba', 'Mando'],
      ],
    },
  },
  {
    id: 144,
    from: '9_stringSubstitution.test.ts › String substitution - non-string replacements, using properties',
    expression: {
      operator: 'stringSubstitution',
      string: 'We have %1 %2 listed with an average value of %3: %4',
      substitutions: [2, 'people', 4.53, ['Boba', 'Mando']],
    },
  },
  {
    id: 145,
    from: '9_stringSubstitution.test.ts › String substitution - too many replacements',
    expression: {
      operator: 'stringSubstitution',
      children: ['The price of milk is %1 per %2', '$2.30', 'liter', 'gallon', '$5.00'],
    },
  },
  {
    id: 146,
    from: '9_stringSubstitution.test.ts › String substitution - too few replacements,',
    expression: {
      operator: 'stringSubstitution',
      children: ["The applicant's name is _%1_ %2 %3.", 'Wanda', 'Maximoff'],
    },
  },
  {
    id: 147,
    from: '9_stringSubstitution.test.ts › String substitution - parameters not ordered, using properties,',
    expression: {
      operator: 'stringSubstitution',
      string: '%2 out of every %3 people are %1',
      substitutions: ['stupid', 'Two', 3],
    },
  },
  {
    id: 148,
    from: '9_stringSubstitution.test.ts › String substitution - parameters not ordered and too few, using props,',
    expression: {
      operator: 'stringSubstitution',
      string: '%2 out of every %3 people are %1',
      replacements: ['stupid', 'Two'],
    },
  },
  {
    id: 149,
    from: '9_stringSubstitution.test.ts › String substitution - parameters not sequential,',
    expression: {
      operator: 'stringSubstitution',
      children: [
        "It shouldn't matter if %10 are big %100 between %101 %200",
        'there',
        'gaps',
        'parameter',
        'numbers',
      ],
    },
  },
  {
    id: 150,
    from: '9_stringSubstitution.test.ts › String substitution - no parameters',
    expression: {
      operator: 'stringSubstitution',
      string: 'This sentence has no replacements.',
      substitutions: ['nothing', 'will', 'happen'],
    },
  },
  {
    id: 151,
    from: '9_stringSubstitution.test.ts › String substitution - no replacements supplied',
    expression: {
      operator: 'stringSubstitution',
      children: ['Your name is %2 %1 but we have nothing to replace them with'],
    },
  },
  {
    id: 152,
    from: '9_stringSubstitution.test.ts › String substitution - some parameters empty strings',
    expression: {
      operator: 'stringSubstitution',
      string: 'You like: %1%2%3',
      substitutions: ['', '\\n-Cake', '\\n-Candy'],
    },
  },
  {
    id: 153,
    from: '9_stringSubstitution.test.ts › String substitution - repeated parameterss',
    expression: {
      operator: 'stringSubstitution',
      string: '%1 is the same as %1 but not %2',
      substitutions: ['THIS', 'THAT'],
    },
  },
  {
    id: 154,
    from: '9_stringSubstitution.test.ts › String substitution - parameters contain further expressions',
    expression: {
      operator: 'stringSubstitution',
      string: { $plus: ['May the %1', ' be with %2'] },
      substitutions: [
        {
          '$?': {
            condition: { $eq: [{ $plus: [50, 50] }, 100] },
            ifTrue: 'Force',
            ifFalse: 'Forks',
          },
        },
        { $plus: ['y', 'o', 'u'] },
      ],
    },
  },
  {
    id: 155,
    from: '9_stringSubstitution.test.ts › String substitution - parameters contain further expressions',
    expression: {
      operator: 'stringSub',
      string: '%1 %2 %3 %4',
      substitutions: {
        $plus: [
          ['One', 'Two'],
          ['Three', 'Four'],
        ],
      },
    },
  },
  {
    id: 156,
    from: '9_stringSubstitution.test.ts › String substitution -- missing parameters',
    expression: { operator: 'replace', irrelevant: 'value' },
  },
  {
    id: 157,
    from: '9_stringSubstitution.test.ts › String substitution - missing replacements parameter',
    expression: { $replace: { string: 'This is the %1' } },
  },
  {
    id: 158,
    from: '9_stringSubstitution.test.ts › String substitution with white space trimming',
    expression: {
      operator: 'stringSubstitution',
      string: 'This is the *%1* entry and this is the %2',
      substitutions: [' first  ', '   second '],
    },
  },
  {
    id: 159,
    from: '9_stringSubstitution.test.ts › String substitution with NO white space trimming',
    expression: {
      operator: 'stringSubstitution',
      string: 'This is the *%1* entry and this is the %2',
      substitutions: [' first  ', '   second '],
      trim: false,
    },
  },
  {
    id: 160,
    from: '9_stringSubstitution.test.ts › String substitution -- escape substitution chars (\\%1)',
    expression: {
      operator: 'stringSubstitution',
      string: 'Only \\%1 of these should be replaced - %1',
      substitutions: [' this one '],
    },
  },
  {
    id: 161,
    from: '9_stringSubstitution.test.ts › String substitution -- multiple escaped substitution chars all un-escaped',
    expression: {
      operator: 'stringSubstitution',
      string: 'Score: %1. Escaped: \\%2 and \\%3',
      substitutions: ['A'],
    },
  },
  {
    id: 162,
    from: '9_stringSubstitution.test.ts › Simple string $ substitution',
    expression: {
      operator: 'stringSubstitution',
      children: ['Hello, $1, welcome to our site.', 'friend'],
      substitutionCharacter: '$',
    },
  },
  {
    id: 163,
    from: '9_stringSubstitution.test.ts › Simple string $ substitution - multiple replacements',
    expression: {
      operator: 'stringSubstitution',
      children: [
        'There are $1 kinds of people in the world:\nthose who understand $2 and those who $3',
        '10',
        'binary',
        "don't",
      ],
      substitutionCharacter: '$',
    },
  },
  {
    id: 164,
    from: '9_stringSubstitution.test.ts › Simple string $ substitution - ignore % fields',
    expression: {
      operator: 'stringSubstitution',
      children: ["We wouldn't $1 need %2 but when we do it should be left $3", 'often', 'alone'],
      substitutionCharacter: '$',
    },
  },
  {
    id: 165,
    from: '9_stringSubstitution.test.ts › String substitution - non-string replacements',
    expression: {
      operator: 'stringSubstitution',
      children: [
        'We have $1 $2 listed with an average value of $3: $4',
        2,
        'people',
        4.53,
        ['Boba', 'Mando'],
      ],
      subCharacter: '$',
    },
  },
  {
    id: 166,
    from: '9_stringSubstitution.test.ts › String substitution - non-string replacements, using properties',
    expression: {
      operator: 'stringSubstitution',
      string: 'We have $1 $2 listed with an average value of $3: $4',
      substitutions: [2, 'people', 4.53, ['Boba', 'Mando']],
      subChar: '$',
    },
  },
  {
    id: 167,
    from: '9_stringSubstitution.test.ts › String substitution - too many $ replacements',
    expression: {
      operator: 'stringSubstitution',
      children: ['The price of milk is $1 per $2', '$2.30', 'liter', 'gallon', '$5.00'],
      subChar: '$',
    },
  },
  {
    id: 168,
    from: '9_stringSubstitution.test.ts › String substitution - too few $ replacements,',
    expression: {
      operator: 'stringSubstitution',
      children: ["The applicant's name is _$1_ $2 $3.", 'Wanda', 'Maximoff'],
      subChar: '$',
    },
  },
  {
    id: 169,
    from: '9_stringSubstitution.test.ts › String substitution - $ parameters not ordered, using properties,',
    expression: {
      operator: 'stringSubstitution',
      string: '$2 out of every $3 people are $1',
      substitutions: ['stupid', 'Two', 3],
      subChar: '$',
    },
  },
  {
    id: 170,
    from: '9_stringSubstitution.test.ts › String substitution - $ parameters not ordered and too few, using props,',
    expression: {
      operator: 'stringSubstitution',
      string: '$2 out of every $3 people are $1',
      replacements: ['stupid', 'Two'],
      subChar: '$',
    },
  },
  {
    id: 171,
    from: '9_stringSubstitution.test.ts › String substitution - $ parameters not sequential,',
    expression: {
      operator: 'stringSubstitution',
      children: [
        "It shouldn't matter if $10 are big $100 between $101 $200",
        'there',
        'gaps',
        'parameter',
        'numbers',
      ],
      subChar: '$',
    },
  },
  {
    id: 172,
    from: '9_stringSubstitution.test.ts › String substitution - no $ replacements supplied',
    expression: {
      operator: 'stringSubstitution',
      children: ['Your name is $2 $1 but we have nothing to replace them with'],
      subChar: '$',
    },
  },
  {
    id: 173,
    from: '9_stringSubstitution.test.ts › String substitution - some $ parameters empty strings',
    expression: {
      operator: 'stringSubstitution',
      string: 'You like: $1$2$3',
      substitutions: ['', '\\n-Cake', '\\n-Candy'],
      subChar: '$',
    },
  },
  {
    id: 174,
    from: '9_stringSubstitution.test.ts › String substitution - repeated $ parameters',
    expression: {
      operator: 'stringSubstitution',
      string: '$1 is the same as $1 but not $2',
      substitutions: ['THIS', 'THAT'],
      subChar: '$',
    },
  },
  {
    id: 175,
    from: '9_stringSubstitution.test.ts › String substitution - $ parameters contain further expressions',
    expression: {
      operator: 'stringSubstitution',
      string: { $plus: ['May the $1', ' be with $2'] },
      substitutions: [
        {
          '$?': {
            condition: { $eq: [{ $plus: [50, 50] }, 100] },
            ifTrue: 'Force',
            ifFalse: 'Forks',
          },
        },
        { $plus: ['y', 'o', 'u'] },
      ],
      subChar: '$',
    },
  },
  {
    id: 176,
    from: '9_stringSubstitution.test.ts › String substitution - $ parameters contain further expressions',
    expression: {
      operator: 'stringSub',
      string: '$1 $2 $3 $4',
      substitutions: {
        $plus: [
          ['One', 'Two'],
          ['Three', 'Four'],
        ],
      },
      subChar: '$',
    },
  },
  {
    id: 177,
    from: '9_stringSubstitution.test.ts › String substitution with white space trimming',
    expression: {
      operator: 'stringSubstitution',
      string: 'This is the *$1* entry and this is the $2',
      substitutions: [' first  ', '   second '],
      subChar: '$',
    },
  },
  {
    id: 178,
    from: '9_stringSubstitution.test.ts › String substitution with NO white space trimming',
    expression: {
      operator: 'stringSubstitution',
      string: 'This is the *$1* entry and this is the $2',
      substitutions: [' first  ', '   second '],
      trim: false,
      subChar: '$',
    },
  },
  {
    id: 179,
    from: '9_stringSubstitution.test.ts › String substitution -- escape substitution chars (\\%1)',
    expression: {
      operator: 'stringSubstitution',
      string: 'Only \\$1 of these should be replaced - $1',
      substitutions: [' this one '],
      subChar: '$',
    },
  },
  {
    id: 180,
    from: '9_stringSubstitution.test.ts › Simple string substitution (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'Hello, {{name}}, welcome to our site.',
      substitutions: { name: 'friend' },
    },
  },
  {
    id: 181,
    from: '9_stringSubstitution.test.ts › Simple string substitution - multiple replacements (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string:
        'There are {{first}} kinds of people in the world:\nthose who understand {{second}} and those who {{3rd}}',
      replacements: { first: '10', second: 'binary', '3rd': "don't" },
    },
  },
  {
    id: 182,
    from: '9_stringSubstitution.test.ts › Named string substitution with pluralisation',
    expression: {
      operator: 'stringSubstitution',
      string: 'Hi {{name}}, you have {{jackets}} and {{shoes}}',
      values: { name: 'Fred', jackets: 5, shoes: 1 },
      plurals: {
        jackets: { '1': '1 jacket', other: '{} jackets' },
        shoes: { '1': 'one pair of shoes', other: '{} pairs of shoes' },
      },
    },
  },
  {
    id: 183,
    from: '9_stringSubstitution.test.ts › Named string substitution - non-string replacements',
    expression: {
      operator: 'stringSubstitution',
      string: 'We have {{num}} {{type}} listed with an average value of {{val}}: {{array}}',
      values: { num: 2, type: 'people', val: 4.53, array: ['Boba', 'Mando'] },
    },
  },
  {
    id: 184,
    from: '9_stringSubstitution.test.ts › String substitution - too many replacements (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'The price of milk is {{price}} per {{unit}}',
      replacements: { price: '$2.30', unit: 'liter', somethingElse: 'gallon' },
    },
  },
  {
    id: 185,
    from: '9_stringSubstitution.test.ts › String substitution - too few replacements (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: "The applicant's name is _{{firstName}}_ {{lastName}} {{other}}.",
      values: { firstName: 'Wanda', lastName: 'Maximoff   ' },
    },
  },
  {
    id: 186,
    from: '9_stringSubstitution.test.ts › String substitution - no parameters (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'This sentence has no replacements.',
      substitutions: { something: 'NOTHING' },
    },
  },
  {
    id: 187,
    from: '9_stringSubstitution.test.ts › String substitution - no replacements supplied (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'Your name is {{first}} {{last}} but we have nothing to replace them with',
      substitutions: {},
    },
  },
  {
    id: 188,
    from: '9_stringSubstitution.test.ts › String substitution - some parameters empty strings (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'You like: {{blank}}{{cake}}{{candy}}',
      substitutions: { blank: '', cake: '\\n-Cake', candy: '\\n-Candy' },
    },
  },
  {
    id: 189,
    from: '9_stringSubstitution.test.ts › String substitution - repeated parameters (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: '{{this}} is the same as {{this}} but not {{that}}',
      substitutions: { this: 'THIS', that: 'THAT' },
    },
  },
  {
    id: 190,
    from: '9_stringSubstitution.test.ts › String substitution - parameters contain further expressions, using "buildObject" (Named substitutions)',
    expression: {
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
    },
  },
  {
    id: 191,
    from: '9_stringSubstitution.test.ts › String substitution - parameters contain further expressions, using "evaluateFullObject" (Named substitutions)',
    expression: {
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
    },
    options: options3,
  },
  {
    id: 192,
    from: '9_stringSubstitution.test.ts › String substitution with white space trimming (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'This is the *{{one}}* entry and this is the {{two}}',
      substitutions: { one: ' first  ', two: '   second ' },
    },
  },
  {
    id: 193,
    from: '9_stringSubstitution.test.ts › String substitution with NO white space trimming (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'This is the *{{one}}* entry and this is the {{two}}',
      substitutions: { one: ' first  ', two: '   second ' },
      trim: false,
    },
  },
  {
    id: 194,
    from: '9_stringSubstitution.test.ts › String substitution -- escape substitution chars (\\{{}}) (Named substitutions)',
    expression: {
      operator: 'stringSubstitution',
      string: 'Only \\{{one}} of these should be replaced - {{one}}',
      substitutions: { one: ' this one ' },
    },
  },
  {
    id: 195,
    from: '9_stringSubstitution.test.ts › String substitution -- multiple escaped named placeholders in a single fragment all un-escaped',
    expression: {
      operator: 'stringSubstitution',
      string: 'Value: {{one}}. Escaped: \\{{two}} and \\{{three}}',
      substitutions: { one: 'A' },
    },
  },
  {
    id: 196,
    from: '9_stringSubstitution.test.ts › Named string substitution with number mapping',
    expression: {
      operator: 'stringSubstitution',
      string: 'Number of things: {{count}}',
      values: { count: { $plus: [1, 2, 3] } },
      numberMap: {
        count: {
          '0': 'None',
          '>10': 'Loads!',
          other: '{}',
          '10.5': 'exactly 10.5',
          '<3': 'Not many 🙁',
        },
      },
    },
    options: options3,
  },
  {
    id: 197,
    from: '9_stringSubstitution.test.ts › Named string substitution with number mapping',
    expression: {
      operator: 'stringSubstitution',
      string: 'Number of things: {{count}}',
      values: { count: 100 },
      numberMap: {
        count: {
          '0': 'None',
          '>10': 'Loads!',
          other: '{}',
          '10.5': 'exactly 10.5',
          '<3': 'Not many 🙁',
        },
      },
    },
    options: options3,
  },
  {
    id: 198,
    from: '9_stringSubstitution.test.ts › Named string substitution with number mapping',
    expression: {
      operator: 'stringSubstitution',
      string: 'Number of things: {{count}}',
      values: { count: { $minus: [10, 10] } },
      numberMap: {
        count: {
          '0': 'None',
          '>10': 'Loads!',
          other: '{}',
          '10.5': 'exactly 10.5',
          '<3': 'Not many 🙁',
        },
      },
    },
    options: options3,
  },
  {
    id: 199,
    from: '9_stringSubstitution.test.ts › Named string substitution with number mapping',
    expression: {
      operator: 'stringSubstitution',
      string: 'Number of things: {{count}}',
      values: { count: { $plus: [10, 0.5] } },
      numberMap: {
        count: {
          '0': 'None',
          '>10': 'Loads!',
          other: '{}',
          '10.5': 'exactly 10.5',
          '<3': 'Not many 🙁',
        },
      },
    },
    options: options3,
  },
  {
    id: 200,
    from: '9_stringSubstitution.test.ts › Named string substitution with number mapping',
    expression: {
      operator: 'stringSubstitution',
      string: 'Number of things: {{count}}',
      values: { count: { $times: [4, 0.5] } },
      numberMap: {
        count: {
          '0': 'None',
          '>10': 'Loads!',
          other: '{}',
          '10.5': 'exactly 10.5',
          '<3': 'Not many 🙁',
        },
      },
    },
    options: options3,
  },
  {
    id: 201,
    from: '9_stringSubstitution.test.ts › String substitution - named replacement from nested object',
    expression: {
      operator: 'stringSubstitution',
      string:
        'This should pull {{val}} from all levels of the {{inner.two}} object, not just the top {{innerArray[0].one.two}}',
      replacements: {
        val: 'values',
        inner: { two: 'replacement' },
        innerArray: [{ one: { two: 'one' } }, { one: { two: 'two' } }],
      },
    },
    options: options3,
  },
  {
    id: 202,
    from: '9_stringSubstitution.test.ts › String substitution - named replacement from nested object and data',
    expression: {
      operator: 'stringSubstitution',
      string:
        'This one {{val}} from nested {{inner.two}} as well as the overall {{inside.data.array[2]}}, and it also should have one value {{cant.find.me}}missing',
      replacements: { val: 'should pull data', inner: { two: 'replacements' } },
    },
    options: {
      evaluateFullObject: true,
      data: { inside: { one: 1, data: { string: 'hi', array: [1, 2, '"data" object'] } } },
    },
  },
  {
    id: 203,
    from: '9_stringSubstitution.test.ts › String substitution - named replacement from nested object and data, with plurals',
    expression: {
      operator: 'stringSubstitution',
      string: 'I have {{how.many.potatoes}}, {{num.carrots}} and {{peaCount[1]}}',
      replacements: { how: { many: { potatoes: 6 } } },
      numberMapping: {
        'how.many.potatoes': { '1': 'one potato', other: '{} potatoes' },
        'num.carrots': { '1': 'just one carrot', other: '{} carrots' },
        'peaCount[1]': { '0': 'no peas', '1': 'one pea', '>1': 'way too many peas to count!' },
      },
    },
    options: { evaluateFullObject: true, data: { num: { carrots: 1 }, peaCount: [null, 100] } },
  },
  {
    id: 204,
    from: '9_stringSubstitution.test.ts › String substitution - named replacement with figTree expressions as replacements, evaluateFullObject off',
    expression: {
      operator: 'stringSubstitution',
      string:
        "This applicant's name is {{user.name.first}} {{user.name.last}}. {{gender}} lives in {{user.country}}, where the capital city is {{capital}}. {{gender}} {{friendCount}}.",
      replacements: {
        capital: {
          operator: 'get',
          url: {
            operator: '+',
            values: ['https://restcountries.com/v3.1/name/', { $getData: 'user.country' }],
          },
          returnProperty: '[0].capital[0]',
          fallback: 'unknown',
        },
        friendCount: { operator: 'count', values: { $getData: 'user.friends' } },
        gender: {
          operator: 'match',
          matchExpression: { $getData: 'user.gender' },
          branches: { female: 'She has', male: 'He has' },
          fallback: 'They have',
        },
      },
      numberMap: {
        friendCount: {
          '0': 'no friends 😢',
          '1': 'only one friend',
          other: '{} friends',
          '>4': 'loads of friends',
        },
      },
    },
    options: {
      data: {
        user: {
          name: { first: 'Natasha', last: 'Romanoff' },
          country: 'Russia',
          friends: ['Steve', 'Bruce', 'Tony'],
          gender: 'female',
        },
      },
    },
  },
  {
    id: 205,
    from: '9_stringSubstitution.test.ts › String substitution - null and undefined named replacements render as empty string',
    expression: {
      operator: 'stringSubstitution',
      string: 'Hello, {{name}}! You are {{age}} years old.',
      replacements: { name: null, age: undefined },
    },
  },
  {
    id: 206,
    from: '9_stringSubstitution.test.ts › String substitution - null and undefined positional replacements render as empty string',
    expression: {
      operator: 'stringSubstitution',
      string: 'Hello, %1! You are %2 years old.',
      replacements: [null, undefined],
    },
  },
  {
    id: 207,
    from: '9_stringSubstitution.test.ts › String substitution - null from "data" object renders as empty string',
    expression: { operator: 'stringSubstitution', string: 'The winner is {{user.nickname}}!' },
    options: options4,
  },
  {
    id: 208,
    from: '9_stringSubstitution.test.ts › String substitution - null returned by a child expression renders as empty string',
    expression: {
      operator: 'stringSubstitution',
      string: 'The winner is {{winner}}!',
      replacements: { winner: { operator: 'getData', property: 'user.nickname' } },
    },
    options: options4,
  },
  {
    id: 209,
    from: '9_stringSubstitution.test.ts › String substitution - nullish values render as empty string with trimWhiteSpace off',
    expression: {
      operator: 'stringSubstitution',
      string: 'Hello, {{name}}! You are {{age}} years old.',
      replacements: { name: null, age: undefined },
      trimWhiteSpace: false,
    },
  },
  {
    id: 210,
    from: '9_stringSubstitution.test.ts › String substitution - false and zero are still rendered',
    expression: {
      operator: 'stringSubstitution',
      string: 'Complete: {{done}}, Remaining: {{count}}',
      replacements: { done: false, count: 0 },
    },
  },
  {
    id: 211,
    from: '10_API.test.ts › GET: Fetch a country',
    expression: {
      operator: 'GET',
      children: ['https://restcountries.com/v3.1/name/zealand', [], 'name.common'],
      type: 'string',
    },
  },
  {
    id: 212,
    from: '10_API.test.ts › GET: Fetch a country, using properties',
    expression: {
      operator: 'GET',
      url: 'https://restcountries.com/v3.1/name/zealand',
      returnProperty: 'name.common',
      type: 'string',
    },
  },
  {
    id: 213,
    from: '10_API.test.ts › GET: Fetch a country with params',
    expression: {
      operator: 'Get',
      children: [
        { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'india'] },
        ['fullText'],
        'true',
        '[0].name.nativeName.hin',
      ],
    },
  },
  {
    id: 214,
    from: '10_API.test.ts › GET: Fetch a country with params, using props',
    expression: {
      operator: 'get',
      endpoint: { operator: '+', values: ['https://restcountries.com/v3.1/name/', 'india'] },
      parameters: { fullText: true },
      outputProperty: '[0].name.nativeName.hin',
    },
  },
  {
    id: 215,
    from: '10_API.test.ts › GET: Return an array of titles plucked from inside array of objects',
    expression: {
      operator: 'api',
      children: ['https://jsonplaceholder.typicode.com/albums', [], 'title'],
    },
  },
  {
    id: 216,
    from: '10_API.test.ts › GET: Fetch comments by post ID, no return prop',
    expression: {
      operator: 'API',
      url: 'https://jsonplaceholder.typicode.com/comments',
      parameters: { postId: 1 },
    },
  },
  {
    id: 217,
    from: '10_API.test.ts › GET: Fetch a country with multiple params',
    expression: {
      operator: 'get',
      children: [
        { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
        ['fullText', 'fields'],
        'true',
        'name,capital,flag',
      ],
    },
  },
  {
    id: 218,
    from: '10_API.test.ts › GET: Fetch a country with multiple params, using props',
    expression: {
      operator: 'API',
      url: { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
      parameters: { fullText: true, fields: 'name,capital,flag' },
    },
  },
  {
    id: 219,
    from: '10_API.test.ts › GET: Fetch a country with multiple params, with nested buildObject for parameters',
    expression: {
      operator: 'API',
      url: { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
      parameters: {
        operator: 'buildObject',
        properties: [
          { key: 'fullText', value: true },
          { key: 'fields', value: 'name,capital,flag' },
        ],
      },
    },
  },
  {
    id: 220,
    from: '10_API.test.ts › POST: Fetch city data with city param as FigTree expression',
    expression: {
      operator: 'post',
      url: 'https://countriesnow.space/api/v0.1/countries/population/cities',
      returnProperty: 'data.populationCounts[0]',
      parameters: { city: { $getData: 'country.city' } },
    },
    options: { data: { country: { city: 'Wellington' } } },
  },
  {
    id: 221,
    from: '10_API.test.ts › GET: Inspect authorization headers',
    expression: {
      operator: 'API',
      url: 'https://httpbin.org/get',
      returnProperty: 'headers.Authorization',
    },
    options: {
      headers: {
        Authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJwb3N0Z3JhcGhpbGUiLCJ1c2VySWQiOjEyLCJzZXNzaW9uSWQiOiJpVzZ5SmR4cE9DeG9yVTl2IiwiaXNBZG1pbiI6ZmFsc2UsInBwMiI6InQiLCJwcDJfdGVtcGxhdGVfaWRzIjoiMSw3LDgsMjgsMzcsMjcsMzAsMjUsMjksMzEsMzMsMzkiLCJpYXQiOjE2NTE4MDgxMDd9.hkYOWbL1pVY_gwQ0QEnK4LirKO180LqeeBQC-U9zeQE',
      },
    },
  },
  {
    id: 222,
    from: '10_API.test.ts › POST: Publish a blog post',
    expression: {
      operator: 'post',
      children: [
        'https://jsonplaceholder.typicode.com/posts',
        ['title', 'body', 'userId'],
        'Episode IV: A New Hope',
        'It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire. During the battle, Rebel spies managed to steal secret plans to the Empire’s ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet...',
        2,
      ],
    },
  },
  {
    id: 223,
    from: '10_API.test.ts › POST: Unsuccessful login, using properties',
    expression: {
      operator: 'POST',
      url: 'https://reqres.in/api/login',
      parameters: { email: 'eve.holt@reqres.in' },
      headers: { 'x-api-key': undefined },
    },
  },
  {
    id: 224,
    from: '10_API.test.ts › POST: Successful login, using parameters from (nested) buildObject',
    expression: {
      operator: 'POST',
      url: 'https://reqres.in/api/login',
      parameters: {
        operator: 'buildObject',
        properties: [
          { key: 'email', value: 'eve.holt@reqres.in' },
          { key: { operator: '+', values: ['pass', 'word'] }, value: 'cityslicka' },
        ],
      },
    },
    options: { headers: { 'x-api-key': '' } },
  },
  {
    id: 225,
    from: '10_API.test.ts › GET: 403 error',
    expression: { operator: 'API', url: 'https://httpbingo.org/status/403' },
  },
  {
    id: 226,
    from: '10_API.test.ts › GET: 404 error',
    expression: { operator: 'API', url: 'https://httpbingo.org/hidden-basic-auth/user/password' },
  },
  {
    id: 227,
    from: '10_API.test.ts › GET: 429 Error with fallback',
    expression: { operator: 'API', url: 'http://httpstat.us/429', fallback: 'There was a problem' },
  },
  {
    id: 228,
    from: '10_API.test.ts › GET: Bad url',
    expression: { operator: 'API', url: 'http://there-is-no-f-ing-site.com' },
  },
  {
    id: 229,
    from: '10_API.test.ts › GET: Fetch a country with params, using props',
    expression: {
      operator: 'get',
      endpoint: { operator: '+', values: ['/v3.1/name/', 'india'] },
      parameters: { fullText: true },
      outputProperty: '[0].name.nativeName.hin',
    },
    options: { baseEndpoint: 'https://restcountries.com/' },
  },
  {
    id: 230,
    from: '11_split.test.ts › Split string by comma',
    expression: { operator: 'split', children: ['Alpha, Beta, Gamma, Delta', ','] },
  },
  {
    id: 231,
    from: '11_split.test.ts › Default delimiter (space) with trailing space',
    expression: { operator: 'arraySplit', children: ['no need to specify delimiter '] },
  },
  {
    id: 232,
    from: "11_split.test.ts › Don't trim whitespace",
    expression: {
      operator: 'SPLIT',
      value: 'A simple, comma-seperated, list',
      delimiter: ',',
      trimWhiteSpace: false,
    },
  },
  {
    id: 233,
    from: '11_split.test.ts › Complex delimiter, with some extraneous whitespace',
    expression: {
      operator: 'split',
      string: { operator: '+', values: ['One ', '  BREAK ', ' Two ', 'BREAK', 'Three  ', 'BREAK'] },
      separator: { operator: 'pass', value: ['BREAK'], outputType: 'string' },
    },
  },
  {
    id: 234,
    from: '11_split.test.ts › Split on a real newline character',
    expression: { operator: 'split', value: 'Line 1\nLine 2\nLine 3', delimiter: '\n' },
  },
  {
    id: 235,
    from: '11_split.test.ts › Split on a literal "\\n" escape sequence (e.g. typed into an editor field)',
    expression: { operator: 'split', value: 'Line 1\nLine 2\nLine 3', delimiter: '\\n' },
  },
  {
    id: 236,
    from: '11_split.test.ts › Split on a literal "\\t" tab escape sequence',
    expression: { operator: 'split', value: 'A\tB\tC', delimiter: '\\t' },
  },
  {
    id: 237,
    from: '11_split.test.ts › Split on a literal "/" delimiter',
    expression: { operator: 'split', value: 'usr/local/bin', delimiter: '/' },
  },
  {
    id: 238,
    from: '11_split.test.ts › Split on "/" is unaffected by escape-sequence handling',
    expression: { operator: 'split', value: 'a / b / c', delimiter: '/' },
  },
  {
    id: 239,
    from: '11_split.test.ts › Split on a single backslash "\\" delimiter',
    expression: { operator: 'split', value: 'one\\two\\three', delimiter: '\\' },
  },
  {
    id: 240,
    from: '12_database.test.ts › Postgres - lookup single string',
    expression: {
      operator: 'postgres',
      children: ["SELECT contact_name FROM customers where customer_id = 'FAMIA';"],
      single: true,
      flatten: true,
    },
  },
  {
    id: 241,
    from: '12_database.test.ts › Postgres - lookup single string (deprecated syntax)',
    expression: {
      operator: 'postgres',
      children: ["SELECT contact_name FROM customers where customer_id = 'FAMIA';"],
      type: 'string',
    },
  },
  {
    id: 242,
    from: '12_database.test.ts › Postgres - get an array of Orders using var substitution',
    expression: {
      operator: 'pg',
      children: [
        "SELECT order_id, TO_CHAR(order_date :: DATE, 'Mon dd, yyyy') as order_date, ship_city, ship_country FROM public.orders WHERE customer_id = $1 AND order_id < 10500;",
        'FAMIA',
      ],
    },
  },
  {
    id: 243,
    from: '12_database.test.ts › Postgres - count employees',
    expression: {
      operator: 'postgres',
      children: ['SELECT COUNT(*) FROM employees'],
      single: true,
      flatten: true,
      type: 'number',
    },
  },
  {
    id: 244,
    from: '12_database.test.ts › Postgres - count employees (deprecated syntax)',
    expression: {
      operator: 'postgres',
      children: ['SELECT COUNT(*) FROM employees'],
      type: 'number',
    },
  },
  {
    id: 245,
    from: '12_database.test.ts › Postgres - get list of (most) products',
    expression: {
      operator: 'pgSQL',
      query: 'SELECT product_name FROM products WHERE category_id = $1 AND supplier_id != $2',
      values: [1, 16],
      flatten: true,
    },
  },
  {
    id: 246,
    from: '12_database.test.ts › Postgres - get list of (most) products',
    expression: {
      operator: 'pgSQL',
      children: [
        'SELECT product_name FROM products WHERE category_id = $1 AND supplier_id != $2',
        1,
        16,
      ],
      flatten: true,
    },
  },
  {
    id: 247,
    from: '12_database.test.ts › Postgres - get list of (most) products, using properties (deprecated syntax)',
    expression: {
      operator: 'pgSQL',
      query:
        'SELECT product_name FROM public.products WHERE category_id = $1 AND supplier_id != $2',
      values: [1, 16],
      type: 'array',
    },
  },
  {
    id: 248,
    from: '12_database.test.ts › Postgres - get list of (most) products, using properties (deprecated syntax)',
    expression: {
      operator: 'pgSQL',
      children: [
        'SELECT product_name FROM public.products WHERE category_id = $1 AND supplier_id != $2',
        1,
        16,
      ],
      type: 'array',
    },
  },
  {
    id: 249,
    from: '12_database.test.ts › Postgres - test single and flattening with multiple records',
    expression: { operator: 'sql', children: ['SELECT * FROM shippers;'] },
  },
  {
    id: 250,
    from: '12_database.test.ts › Postgres - test single and flattening with multiple records',
    expression: { operator: 'sql', query: 'SELECT * FROM shippers;', single: true },
  },
  {
    id: 251,
    from: '12_database.test.ts › Postgres - test single and flattening with multiple records',
    expression: { operator: 'sql', children: ['SELECT * FROM shippers;'], flatten: true },
  },
  {
    id: 252,
    from: '12_database.test.ts › Postgres - test single and flattening with multiple records',
    expression: { operator: 'sql', query: 'SELECT * FROM shippers;', single: true, flatten: true },
  },
  {
    id: 253,
    from: '12_database.test.ts › Postgres - test single and flattening with single result record',
    expression: { operator: 'sql', children: ['SELECT * FROM shippers WHERE shipper_id = $1;', 6] },
  },
  {
    id: 254,
    from: '12_database.test.ts › Postgres - test single and flattening with single result record',
    expression: {
      operator: 'sql',
      query: 'SELECT * FROM shippers WHERE shipper_id = $1;',
      values: [6],
      single: true,
    },
  },
  {
    id: 255,
    from: '12_database.test.ts › Postgres - test single and flattening with single result record',
    expression: {
      operator: 'sql',
      children: ['SELECT * FROM shippers WHERE shipper_id = $1;', 6],
      flatten: true,
    },
  },
  {
    id: 256,
    from: '12_database.test.ts › Postgres - test single and flattening with single result record',
    expression: {
      operator: 'sql',
      query: 'SELECT * FROM shippers WHERE shipper_id = $1;',
      values: [6],
      single: true,
      flatten: true,
    },
  },
  {
    id: 257,
    from: '12_database.test.ts › Postgres - database error',
    expression: { operator: 'sql', children: ['SELECT * FROM employee_table'], type: 'number' },
  },
  {
    id: 258,
    from: '12_database.test.ts › GraphQL - get list of countries',
    expression: {
      operator: 'GraphQL',
      children: [
        'query getCountries {\n            countries(filter: {continent: {eq: "OC"}}) {\n              name\n            }\n          }',
        'https://countries.trevorblades.com/',
        [],
      ],
    },
  },
  {
    id: 259,
    from: '12_database.test.ts › GraphQL - get list of countries, using properties, use default endpoint',
    expression: {
      operator: 'GraphQL',
      query:
        'query getCountries {\n        countries(filter: {continent: {eq: "OC"}}) {\n          name\n        }\n      }',
    },
  },
  {
    id: 260,
    from: '12_database.test.ts › GraphQL - single country lookup, default endpoint, return node',
    expression: {
      operator: 'GraphQL',
      children: [
        'query getCountry($code: String!) {\n        countries(filter: {code: {eq: $code}}) {\n          name\n          emoji\n        }\n      }',
        null,
        ['code'],
        'NZ',
        'countries.emoji',
      ],
      type: 'string',
    },
  },
  {
    id: 261,
    from: '12_database.test.ts › GraphQL - single country lookup, default endpoint, return node, using props',
    expression: {
      operator: 'graphQL',
      query:
        'query getCountry($code: String!) {\n        countries(filter: {code: {eq: $code}}) {\n          name\n          emoji\n        }\n      }',
      variables: { code: { operator: 'getData', property: 'code' } },
      returnNode: 'countries[0].emoji',
    },
    options: { data: { code: 'NZ' } },
  },
  {
    id: 262,
    from: '12_database.test.ts › GraphQL - single country lookup, default endpoint, return node, using parameters from buildObject',
    expression: {
      operator: 'graphQL',
      query:
        'query getCountry($code: String!) {\n        countries(filter: {code: {eq: $code}}) {\n          name\n          emoji\n        }\n      }',
      variables: {
        operator: 'buildObject',
        values: [
          {
            key: 'code',
            value: {
              operator: 'GET',
              children: ['https://restcountries.com/v3.1/name/nepal', [], '[0].cca2'],
            },
          },
        ],
      },
      returnNode: 'countries[0].emoji',
    },
  },
  {
    id: 263,
    from: '12_database.test.ts › GraphQL - Get repo info using partial url and updated options, requires auth',
    expression: {
      operator: 'graphQL',
      url: 'graphql',
      query:
        'query($repoName:String!){\n              viewer {\n                login\n                repository(name: $repoName) {\n                  description\n                }\n              }\n            }',
      variables: { repoName: 'fig-tree' },
      returnNode: 'viewer.repository.description',
    },
    options: {
      graphQLConnection: {
        endpoint: 'https://api.github.com/',
        headers: { Authorization: 'Bearer undefined' },
      },
    },
  },
  {
    id: 264,
    from: '13_customFunctions.test.ts › Custom functions - double elements in an array',
    expression: { operator: 'customFunctions', children: ['fDouble', 1, 2, 3, 'four'] },
    options: options5,
  },
  {
    id: 265,
    from: '13_customFunctions.test.ts › Custom functions - create a date from a string',
    expression: {
      operator: 'function',
      children: ['fDate', { operator: '+', children: ['December 17, ', '1995 03:24:00'] }],
    },
    options: options5,
  },
  {
    id: 266,
    from: '13_customFunctions.test.ts › Custom functions - double elements in an array, using properties',
    expression: { operator: 'objectFunctions', functionPath: 'fDouble', args: [1, 2, 3, 'four'] },
    options: options5,
  },
  {
    id: 267,
    from: '13_customFunctions.test.ts › Custom functions - fallback to a function on Objects not Functions option',
    expression: { operator: 'runFunction', functionPath: 'functions.square', args: [88] },
    options: options5,
  },
  {
    id: 268,
    from: '13_customFunctions.test.ts › Custom functions - "functions." is in path string',
    expression: {
      operator: 'runFunction',
      children: ['functions.getFullName', { firstName: 'First', lastName: 'Last' }],
    },
    options: options5,
  },
  {
    id: 269,
    from: '13_customFunctions.test.ts › Custom functions - "functions." is in path string and function is in "objects',
    expression: { operator: 'runFunction', functionPath: 'functions.fDouble', args: [8] },
    options: options5,
  },
  {
    id: 270,
    from: '13_customFunctions.test.ts › Custom functions - create a date from a string',
    expression: {
      operator: 'function',
      functionPath: 'fDate',
      input: { operator: '+', children: ['December 17, ', '1995 03:24:00'] },
    },
    options: options6,
  },
  {
    id: 271,
    from: '13_customFunctions.test.ts › Custom functions - no args',
    expression: { operator: 'function', functionPath: 'fNoArgs' },
    options: options5,
  },
  {
    id: 272,
    from: '13_customFunctions.test.ts › Custom functions - no args as children',
    expression: { operator: 'function', children: ['fNoArgs'] },
    options: options5,
  },
  {
    id: 273,
    from: '13_customFunctions.test.ts › Custom functions - primitive input value',
    expression: { operator: 'function', functionPath: 'increment', input: 5 },
    options: { functions: { increment: { function: (n) => n + 1, inputDefault: 5 } } },
  },
  {
    id: 274,
    from: '13_customFunctions.test.ts › Custom functions - falsy primitive input value (0)',
    expression: { operator: 'function', functionPath: 'isZero', input: 0 },
    options: { functions: { isZero: { function: (n) => n === 0, inputDefault: 0 } } },
  },
  {
    id: 275,
    from: '13_customFunctions.test.ts › Custom functions - invalid function path',
    expression: { operator: 'function', functionPath: 'invalid.path' },
    options: options5,
  },
  {
    id: 276,
    from: '13_customFunctions.test.ts › Custom functions - path is not a function',
    expression: { operator: 'function', functionPath: 'functions.notAFunction' },
    options: options5,
  },
  {
    id: 277,
    from: '13_customFunctions.test.ts › Custom functions - verbose function definition structure',
    expression: { operator: 'function', function: 'reverse', input: [1, 2, 3, 4] },
    options: options5,
  },
  {
    id: 278,
    from: '13_customFunctions.test.ts › Custom operators - double elements in an array',
    expression: { operator: 'fDouble', args: [1, 2, 3, 'four'] },
    options: options5,
  },
  {
    id: 279,
    from: '13_customFunctions.test.ts › Custom operators - create a date from a string',
    expression: {
      operator: 'fDate',
      args: [{ operator: '+', children: ['December 17, ', '1995 03:24:00'] }],
    },
    options: options5,
  },
  {
    id: 280,
    from: '13_customFunctions.test.ts › Custom operators - create a date from a string',
    expression: {
      operator: 'fDate',
      input: { operator: '+', children: ['December 23, ', '1995 03:24:00'] },
    },
    options: options6,
  },
  {
    id: 281,
    from: '13_customFunctions.test.ts › Custom operators - no args',
    expression: { operator: 'fNoArgs' },
    options: options5,
  },
  {
    id: 282,
    from: '13_customFunctions.test.ts › Custom operators - invalid function path',
    expression: { operator: 'invalid.path' },
    options: options5,
  },
  {
    id: 283,
    from: '13_customFunctions.test.ts › Custom operators - verbose function definition structure',
    expression: { operator: 'reverse', input: [1, 2, 3, 4] },
    options: options5,
  },
  {
    id: 284,
    from: '13_customFunctions.test.ts › Custom operators - properties to args',
    expression: {
      operator: 'getFullName',
      firstName: { $getData: 'user.firstName' },
      lastName: { $getData: 'user.lastName' },
    },
    options: options5,
  },
  {
    id: 285,
    from: '13_customFunctions.test.ts › Custom operators (shorthand) - double elements in an array',
    expression: { $fDouble: [1, 2, 3, 'four'] },
    options: options5,
  },
  {
    id: 286,
    from: '13_customFunctions.test.ts › Custom operators (shorthand) - create a date from a string',
    expression: { $fDate: { operator: '+', children: ['December 17, ', '1995 03:24:00'] } },
    options: options5,
  },
  {
    id: 287,
    from: '13_customFunctions.test.ts › Custom operators (shorthand) - create a date from a string',
    expression: {
      $fDate: { input: { operator: '+', children: ['December 23, ', '1995 03:24:00'] } },
    },
    options: options5,
  },
  {
    id: 288,
    from: '13_customFunctions.test.ts › Custom operators (shorthand) - no args',
    expression: { $fNoArgs: null },
    options: options5,
  },
  {
    id: 289,
    from: '13_customFunctions.test.ts › Custom operators (shorthand) - invalid function path/operator',
    expression: { $invalidFunction: null },
    options: options5,
  },
  {
    id: 290,
    from: '13_customFunctions.test.ts › Custom operators (shorthand) - verbose function definition structure',
    expression: { $reverse: { input: [1, 2, 3, 4] } },
    options: options5,
  },
  {
    id: 291,
    from: '13_customFunctions.test.ts › Custom operators (shorthand) - properties to args',
    expression: {
      $getFullName: {
        firstName: { $getData: 'user.firstName' },
        lastName: { $getData: 'user.lastName' },
      },
    },
    options: options5,
  },
  {
    id: 292,
    from: '14_buildObject.test.ts › buildObject - basic',
    expression: { operator: 'buildObject', properties: [{ key: 'someKey', value: 'someValue' }] },
  },
  {
    id: 293,
    from: '14_buildObject.test.ts › buildObject - basic, with children',
    expression: { operator: 'buildObject', children: ['someKey', 'someValue'] },
  },
  {
    id: 294,
    from: '14_buildObject.test.ts › buildObject - basic, shorthand',
    expression: { $buildObject: ['someKey', 'someValue'] },
  },
  {
    id: 295,
    from: '14_buildObject.test.ts › buildObject - handling erroneous input',
    expression: {
      operator: 'buildObject',
      values: [
        { value: 'missing key' },
        { key: 'someKey', value: 'someValue' },
        {},
        { key: 'missing value' },
      ],
    },
    options: options7,
  },
  {
    id: 296,
    from: '14_buildObject.test.ts › buildObject - with evaluated key and value',
    expression: {
      operator: 'buildObject',
      keyValPairs: [
        { key: 'someKey', value: 'someValue' },
        {
          key: { operator: 'objectProperties', children: ['key'] },
          value: { operator: 'objectProperties', children: ['value'] },
        },
      ],
    },
    options: options7,
  },
  {
    id: 297,
    from: '14_buildObject.test.ts › buildObject - with evaluations and nesting',
    expression: {
      operator: 'buildObject',
      keyValuePairs: [
        { key: 'someKey', value: 'someValue' },
        {
          key: { operator: 'objectProperties', children: ['key'] },
          value: {
            operator: 'buildObject',
            properties: [{ key: 'concatArray', value: { operator: '+', values: [['one'], [2]] } }],
          },
        },
      ],
    },
    options: options7,
  },
  {
    id: 298,
    from: '14_buildObject.test.ts › buildObject - missing properties',
    expression: { operator: 'buildObject' },
    options: options7,
  },
  {
    id: 299,
    from: '14_buildObject.test.ts › buildObject - invalid key type',
    expression: {
      operator: 'buildObject',
      properties: [{ key: [1, 2], value: 3 }, { missingKey: 2 }],
    },
    options: options7,
  },
  {
    id: 300,
    from: '15_errorsAndFallbacks.test.ts › ERROR - Invalid operator',
    expression: { operator: 'run', children: [1, 2] },
  },
  {
    id: 301,
    from: '15_errorsAndFallbacks.test.ts › FALLBACK - Invalid operator',
    expression: { operator: 'run', children: [1, 2], fallback: 'Safe' },
    options: options8,
  },
  {
    id: 302,
    from: '15_errorsAndFallbacks.test.ts › ERROR - Invalid/Missing children error',
    expression: { operator: 'OR', children: 2 },
  },
  {
    id: 303,
    from: '15_errorsAndFallbacks.test.ts › ERROR as string - Invalid/Missing children',
    expression: { operator: 'OR', children: 2 },
    options: options8,
  },
  {
    id: 304,
    from: '15_errorsAndFallbacks.test.ts › ERROR - Invalid output type',
    expression: { operator: '+', children: [1, 2], type: 'Integer' },
  },
  {
    id: 305,
    from: '15_errorsAndFallbacks.test.ts › OR - Error',
    expression: { operator: 'OR' },
    options: options8,
  },
  {
    id: 306,
    from: '15_errorsAndFallbacks.test.ts › OR - Error as string',
    expression: { operator: 'OR' },
  },
  {
    id: 307,
    from: '15_errorsAndFallbacks.test.ts › OR - Fallback',
    expression: { operator: 'OR', fallback: 'All good' },
    options: options8,
  },
  {
    id: 308,
    from: '15_errorsAndFallbacks.test.ts › AND - Error',
    expression: { operator: 'AND' },
    options: options8,
  },
  {
    id: 309,
    from: '15_errorsAndFallbacks.test.ts › AND - Error as string',
    expression: { operator: 'And' },
    options: options8,
  },
  {
    id: 310,
    from: '15_errorsAndFallbacks.test.ts › OR - Fallback',
    expression: { operator: 'and', fallback: 'All good' },
    options: options8,
  },
  {
    id: 311,
    from: '15_errorsAndFallbacks.test.ts › REGEX - Error',
    expression: { operator: 'regex', pattern: { one: 1 }, testString: 'anything' },
    options: options8,
  },
  {
    id: 312,
    from: '15_errorsAndFallbacks.test.ts › REGEX - Fallback',
    expression: {
      operator: 'pattern-match',
      pattern: { one: 1 },
      testString: 'anything',
      fallback: 'Saved from error',
    },
    options: options8,
  },
  {
    id: 313,
    from: '15_errorsAndFallbacks.test.ts › API - Fallback',
    expression: {
      operator: 'get',
      url: 'https://restcountries.com/v3.1/name/zealands',
      returnProperty: 'name.common',
      fallback: null,
    },
    options: options8,
  },
  {
    id: 314,
    from: '15_errorsAndFallbacks.test.ts › ERROR - bubble up from nested',
    expression: {
      operator: 'and',
      children: [
        { operator: '=', values: [{ operator: 'plus', values: [5, 4] }, 9] },
        { operator: 'regex', pattern: { one: 1 }, testString: 'anything' },
      ],
    },
    options: options8,
  },
  {
    id: 315,
    from: '15_errorsAndFallbacks.test.ts › FALLBACK - multiple bubble up and join',
    expression: {
      operator: 'join',
      values: [
        {
          operator: 'get',
          url: 'https://restcountries.com/v3.1/name/zealands',
          returnProperty: 'name.common',
          fallback: 'First Error',
        },
        ' / ',
        {
          operator: 'pattern-match',
          pattern: { one: 1 },
          testString: 'anything',
          fallback: 'Second Error',
        },
      ],
    },
  },
  {
    id: 316,
    from: '15_errorsAndFallbacks.test.ts › Loose equality - null !== undefined',
    expression: { operator: '=', values: [null, undefined], nullEqualsUndefined: false },
    options: options8,
  },
  {
    id: 317,
    from: '15_errorsAndFallbacks.test.ts › Fallback is an operator node',
    expression: {
      operator: 'get',
      url: 'https://restcountries.com/v3.1/name/zealands',
      returnProperty: 'name.common',
      fallback: { operator: '+', values: [3, 5, 7] },
    },
    options: options8,
  },
  {
    id: 318,
    from: '15_errorsAndFallbacks.test.ts › ObjProps Fallback is an operator node',
    expression: {
      operator: 'objectProperties',
      property: 'user.name',
      fallback: { operator: '+', values: [3, 5, 7] },
    },
    options: options9,
  },
  {
    id: 319,
    from: '15_errorsAndFallbacks.test.ts › Skip runtime type checking, from current options',
    expression: { operator: 'objectProperties', property: ['not', 'a', 'string'] },
    options: options9,
  },
  {
    id: 320,
    from: '15_errorsAndFallbacks.test.ts › Skip runtime type checking, from constructor options',
    expression: { operator: 'objectProperties', property: ['not', 'a', 'string'] },
    options: { data: { user: 'Unknown' } },
  },
  {
    id: 321,
    from: '15_errorsAndFallbacks.test.ts › GET - 404 error',
    expression: { operator: 'get', url: 'https://httpbingo.org/hidden-basic-auth/user/password' },
    options: options8,
  },
  {
    id: 322,
    from: '15_errorsAndFallbacks.test.ts › POST - Bad login',
    expression: {
      operator: 'POST',
      url: 'https://reqres.in/api/login',
      parameters: { email: 'eve.holt@reqres.in' },
      headers: { 'x-api-key': undefined },
    },
    options: options8,
  },
  {
    id: 323,
    from: '16_outputConversion.test.ts › Try and convert NaN to number -- return 0',
    expression: { operator: 'objectProperties', property: 'justAString', type: 'number' },
    options: { data: { justAString: 'Not a number' } },
  },
  {
    id: 324,
    from: '16_outputConversion.test.ts › Convert a string to a number',
    expression: { operator: '+', values: ['5', '6'], type: 'number' },
  },
  {
    id: 325,
    from: '16_outputConversion.test.ts › Convert a number to a string',
    expression: { operator: '+', values: [150, 150], outputType: 'string' },
  },
  {
    id: 326,
    from: '16_outputConversion.test.ts › Multiple children converted to string, then joined',
    expression: {
      operator: '+',
      values: [
        { operator: 'plus', values: [5, 5] },
        { operator: 'and', values: [false, true, true], type: 'string' },
        { operator: '+', values: [null], type: 'string' },
      ],
    },
  },
  {
    id: 327,
    from: '16_outputConversion.test.ts › String co-erced to array then merged with another array',
    expression: {
      operator: '+',
      values: [[1, 2, 3], { operator: '+', values: [4], type: 'array' }],
    },
  },
  {
    id: 328,
    from: '16_outputConversion.test.ts › Various values coerced to boolean then concatenated to array',
    expression: {
      operator: '+',
      type: 'array',
      values: [
        { operator: '+', values: ['string'], type: 'bool' },
        { operator: '+', values: [5], type: 'bool' },
        { operator: '+', values: [null], type: 'bool' },
        { operator: '+', values: [0], type: 'bool' },
        { operator: '+', values: [''], type: 'bool' },
      ],
    },
  },
  {
    id: 329,
    from: '16_outputConversion.test.ts › Coerce string to boolean',
    expression: {
      operator: '=',
      children: [{ operator: '+', type: 'bool', children: ['three'] }, true],
    },
  },
  {
    id: 330,
    from: '16_outputConversion.test.ts › Pass through unmodified (passThru operator)',
    expression: { operator: 'pass', value: 999.99 },
  },
  {
    id: 331,
    from: '16_outputConversion.test.ts › Pass through unmodified using children',
    expression: { operator: 'pass', children: [999.99] },
  },
  {
    id: 332,
    from: '16_outputConversion.test.ts › Pass through unmodified using children -- multiple values',
    expression: { operator: 'pass', children: [999.99, 'three'] },
  },
  {
    id: 333,
    from: '16_outputConversion.test.ts › Pass through with evaluation, coerce to number',
    expression: {
      operator: 'pass',
      children: [{ operator: '+', values: ['9', '99', '.', '99'] }],
      outputType: 'number',
    },
  },
  {
    id: 334,
    from: '16_outputConversion.test.ts › Pass through with evaluation, coerce to string',
    expression: {
      operator: 'pass',
      value: { operator: 'add', values: [900, 90, 9, 0.99] },
      outputType: 'string',
    },
  },
  {
    id: 335,
    from: '16_outputConversion.test.ts › Coerce output to string from evaluated "type" node',
    expression: {
      operator: 'objectProperties',
      path: 'find.me',
      outputType: { operator: '+', values: ['str', 'ing'] },
    },
    options: { data: { find: { me: 500 } } },
  },
  {
    id: 336,
    from: '16_outputConversion.test.ts › Extract numberic content from string',
    expression: {
      operator: 'pass',
      value: 'There is a number 46 inside here!',
      outputType: 'number',
    },
  },
  {
    id: 337,
    from: '16_outputConversion.test.ts › Extract decimal numeric content from string',
    expression: { operator: 'objectProperties', path: 'standard.path', outputType: 'number' },
    options: { data: { standard: { path: "99.021 is what we're looking for" } } },
  },
  {
    id: 338,
    from: '16_outputConversion.test.ts › Extract with no leading 0 from start of string',
    expression: { operator: 'objectProperties', path: 'basic', outputType: 'number' },
    options: { data: { basic: '.001 is a very small number' } },
  },
  {
    id: 339,
    from: '16_outputConversion.test.ts › Add two extracted numbers',
    expression: {
      operator: '+',
      values: [
        { operator: 'pass', value: 'The number is .995 not 0.23', outputType: 'number' },
        {
          operator: 'objectProperties',
          path: 'Not.found',
          fallback: { $pass: 'We have 3 people', outputType: 'number' },
        },
      ],
    },
  },
  {
    id: 340,
    from: '16_outputConversion.test.ts › Handle number conversion when already a number',
    expression: { operator: '+', values: [1, 2, 3, 4, 5, 6], outputType: 'number' },
  },
  {
    id: 341,
    from: '16_outputConversion.test.ts › Return 0 if converting to number when string has no numeric content',
    expression: { operator: '+', values: ['this', 'plus', 'this'], outputType: 'number' },
  },
  {
    id: 342,
    from: '17_complexExpressions.test.ts › Input is an array -- each item will be evaluated',
    expression: [
      { operator: '+', values: [6, 7, 8] },
      { operator: 'objectProperties', property: 'name' },
      { operator: '!=', children: [6, 'tree'] },
    ],
    options: {
      functions: { getPrincess: (name) => `Princess ${name}` },
      fragments: { doubleLineBreak: { $plus: ['\n', '\n'] } },
      data: {
        randomWords: ['starfield', 'spaceships', 'planetary', ['DEATH STAR']],
        organisation: 'Galactic Empire',
        longSentence: {
          '🇨🇺': "Rebel spies managed to steal secret plans to the Empire's ultimate weapon",
        },
        Oceania: { NZ: { Wellington: 'stolen plans that can save her people' } },
        name: 'Percy',
      },
    },
  },
  {
    id: 343,
    from: '17_complexExpressions.test.ts › "values" is an evaluator expression, should evaluate to standard values array',
    expression: { operator: 'and', values: { operator: '+', values: [['this'], ['that']] } },
    options: options10,
  },
  {
    id: 344,
    from: '17_complexExpressions.test.ts › "children" is an evaluator expression, should evaluate to standard child array',
    expression: {
      operator: 'objectProperties',
      children: { operator: '+', outputType: 'array', values: ['randomWords.', '[2]'] },
    },
    options: options10,
  },
  {
    id: 345,
    from: '17_complexExpressions.test.ts › "children" is an evaluator expression but doesn\'t return an array',
    expression: {
      operator: 'objectProperties',
      children: { operator: '+', values: ['randomWords.', '[2]'] },
    },
    options: options10,
  },
  {
    id: 346,
    from: '17_complexExpressions.test.ts › Massive nested query!',
    expression: {
      $bypass: {
        operator: 'passThru',
        value: { operator: 'split', value: 'robot, ,fury', delimiter: ',', trimWhitespace: false },
        type: 'number',
      },
      $country: {
        operator: 'API',
        children: [
          { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
          { operator: 'split', value: 'fullText, fields', delimiter: ',' },
          true,
          'name,capital,flag',
          'flag',
        ],
        type: 'string',
      },
      operator: '+',
      values: [
        {
          operator: 'stringSubstitution',
          children: [
            'It is a period of %1. Rebel %2, striking from a hidden base, have won their first victory against the evil %3.',
            {
              operator: '?',
              children: [
                {
                  operator: '=',
                  values: [
                    {
                      operator: 'pg',
                      query: 'SELECT country FROM customers WHERE postal_code = $1',
                      values: [
                        {
                          operator: 'pgSQL',
                          children: ['(SELECT MAX(postal_code) from customers)'],
                          type: 'string',
                        },
                      ],
                      type: 'string',
                    },
                    'UK',
                  ],
                },
                { operator: '_', _: ['civil war'], type: 'string' },
                '$bypass',
              ],
            },
            {
              operator: 'getProperty',
              property: {
                operator: 'substitute',
                children: [
                  'randomWords[%99]',
                  {
                    operator: 'And',
                    values: [
                      {
                        operator: 'REGEX',
                        pattern: 'A.+roa',
                        testString: {
                          operator: 'get',
                          url: 'https://restcountries.com/v3.1/alpha',
                          parameters: { codes: 'nz' },
                          returnProperty: '[0].name.nativeName.mri.official',
                        },
                      },
                      { operator: 'ne', values: [{ operator: '+', values: [6.66, 3.33] }, 10] },
                    ],
                    type: 'number',
                  },
                ],
              },
            },
            { operator: 'objectProperties', children: ['organisation'] },
          ],
        },
        { fragment: 'doubleLineBreak' },
        {
          operator: 'SUBSTITUTE',
          string:
            'During the battle, %1, the %2, an armored space station with enough power to destroy an entire planet.',
          substitutions: [
            {
              operator: 'objectProperties',
              property: { operator: '+', values: ['longSentence.', '$country'] },
            },
            { $wordString: 'randomWords[3]', operator: 'objProps', property: '$wordString' },
          ],
        },
        { fragment: 'doubleLineBreak' },
        {
          $myFallback: 'Empire',
          operator: 'string_substitution',
          string:
            "Pursued by the {{enemy}}'s sinister agents, {{who}} races home aboard her starship, custodian of the {{what}} and restore freedom to the galaxy....",
          substitutions: {
            who: { operator: 'functions', functionPath: 'getPrincess', args: ['Leia'] },
            what: {
              operator: 'objProps',
              property: {
                operator: 'substitute',
                string: 'Oceania.NZ.%1',
                substitutions: [
                  {
                    operator: 'gql',
                    query:
                      'query capitals($code:String!) {countries(filter: {code: {eq: $code}}) {capital}}',
                    variables: {
                      operator: 'buildObject',
                      properties: [{ key: 'code', value: 'NZ' }],
                    },
                    returnNode: 'countries',
                  },
                ],
              },
            },
            enemy: { operator: 'objProps', property: 'cant.find.this', fallback: '$myFallback' },
          },
        },
      ],
    },
    options: options11,
  },
  {
    id: 347,
    from: '17_complexExpressions.test.ts › Massive nested query in shorthand',
    expression: {
      $bypass: {
        operator: 'passThru',
        value: { $split: { value: 'robot, ,fury', delimiter: ',', trimWhitespace: false } },
        type: 'number',
      },
      $country: {
        $API: [
          { $plus: ['https://restcountries.com/v3.1/name/', 'cuba'] },
          { $split: { value: 'fullText, fields', delimiter: ',' } },
          true,
          'name,capital,flag',
          'flag',
        ],
        type: 'string',
      },
      $plus: [
        {
          $stringSubstitution: [
            'It is a period of %1. Rebel %2, striking from a hidden base, have won their first victory against the evil %3.',
            {
              $conditional: [
                {
                  $eq: [
                    {
                      $pg: {
                        query: 'SELECT country FROM customers WHERE postal_code = $1',
                        values: [
                          { $pgSQL: ['(SELECT MAX(postal_code) from customers)'], type: 'string' },
                        ],
                      },
                      type: 'string',
                    },
                    'UK',
                  ],
                },
                { $_: ['civil war'], type: 'string' },
                '$bypass',
              ],
            },
            {
              $getProperty: {
                $substitute: [
                  'randomWords[%99]',
                  {
                    $And: [
                      {
                        $regex: {
                          pattern: 'A.+roa',
                          testString: {
                            $get: [
                              'https://restcountries.com/v3.1/alpha',
                              'codes',
                              'nz',
                              '[0].name.nativeName.mri.official',
                            ],
                          },
                        },
                      },
                      { $ne: [{ $plus: [6.66, 3.33] }, 10] },
                    ],
                    type: 'number',
                  },
                ],
              },
            },
            { $getData: 'organisation' },
          ],
        },
        { $doubleLineBreak: {} },
        {
          $substitute: [
            'During the battle, %1, the %2, an armored space station with enough power to destroy an entire planet.',
            { $getData: { $plus: ['longSentence.', '$country'] } },
            { $getData: '$wordString', $wordString: 'randomWords[3]' },
            null,
          ],
        },
        { $doubleLineBreak: {} },
        {
          $myFallback: 'Empire',
          $stringSubstitution: {
            string:
              "Pursued by the {{enemy}}'s sinister agents, {{who}} races home aboard her starship, custodian of the {{what}} and restore freedom to the galaxy....",
            replacements: {
              who: { $functions: ['getPrincess', 'Leia'] },
              what: {
                $objProps: {
                  $substitute: {
                    string: 'Oceania.NZ.%1',
                    substitutions: [
                      {
                        $gql: {
                          query:
                            'query capitals($code:String!) {countries(filter: {code: {eq: $code}}) {capital}}',
                          variables: { $buildObject: ['code', 'NZ'] },
                          returnNode: 'countries',
                        },
                      },
                    ],
                  },
                },
              },
              enemy: { $objProps: 'cant.find.this', fallback: '$myFallback' },
            },
          },
        },
      ],
    },
    options: options11,
  },
  {
    id: 348,
    from: '17_complexExpressions.test.ts › Process an enormous auto-generated query',
    expression: massiveQuery,
    options: {
      functions: {
        '666': (val) => (val === 'words' ? '^%d$' : '%4 '),
        getPrincess: (name) => `Princess ${name}`,
        words: () => 'sen',
        sen: () => 'not',
        tence: () => 'somewhere.not.so.deep',
        not: (str) => 'somewhere.not.so.quiet' + str,
        too: (str) => 'somewhere.not.so.quiet' + str,
      },
      fragments: { doubleLineBreak: { $plus: ['\n', '\n'] } },
      data: {
        '500': '[1]',
        randomWords: ['starfield', 'spaceships', 'planetary', ['DEATH STAR']],
        organisation: 'Galactic Empire',
        longSentence: {
          '🇨🇺': "Rebel spies managed to steal secret plans to the Empire's ultimate weapon",
        },
        Oceania: { NZ: { Wellington: 'stolen plans that can save her people' } },
        somewhere: {
          quite: { deep: 'This ' },
          not: { so: { deep: 'has ', quiet: ['%2 ', '%3 '] } },
        },
        tence: '[0]',
        number: [0, 500],
      },
      evaluateFullObject: true,
    },
  },
  {
    id: 349,
    from: '18_optionHandling.test.ts › Check options objects get merged correctly',
    expression: {
      operator: '+',
      values: [
        { operator: 'OBJECT_PROPERTIES', property: 'first' },
        { operator: 'objProps', property: 'third.number' },
      ],
    },
    options: {
      functions: { f1: (a) => 2 * a },
      data: { first: 1, second: 2, third: { number: 10, word: 'other' } },
    },
  },
  {
    id: 350,
    from: '18_optionHandling.test.ts › Check functions objects get merged correctly',
    expression: {
      operator: '+',
      values: [
        { operator: 'customFunctions', functionName: 'f1', args: [10] },
        { operator: 'functions', path: 'f2', variables: [7] },
      ],
    },
    options: { functions: { f1: (a) => 2 * a, f2: (a) => a + 7 }, data: { first: 1, second: 2 } },
  },
  {
    id: 351,
    from: '18_optionHandling.test.ts › Operator exclusion: ignore invalid exclusion value',
    expression: { operator: '+', values: [1, 16] },
  },
  {
    id: 352,
    from: '18_optionHandling.test.ts › Operator exclusion: update options later -- previous exclusions are restored',
    expression: { operator: '+', values: [8, 9, 10] },
  },
  {
    id: 353,
    from: '18_optionHandling.test.ts › Operator exclusion: exclude in evaluation call -- check only excluded for one evaluation',
    expression: { operator: '+', values: [1, 2, 3] },
  },
  {
    id: 354,
    from: '18_optionHandling.test.ts › Operator exclusion: exclude in evaluation call -- check only excluded for one evaluation',
    expression: { operator: 'multiply', values: [{ operator: 'subtract', values: [10, 3] }, 10] },
  },
  {
    id: 355,
    from: '19_aliasNodes.test.ts › Alias Nodes: Do only one network lookup',
    expression: {
      operator: '?',
      $getNZ: {
        operator: 'GET',
        children: ['https://restcountries.com/v3.1/name/zealand', [], 'name.common'],
        type: 'string',
      },
      condition: { operator: '!=', values: ['$getNZ', null] },
      valueIfTrue: '$getNZ',
      valueIfFalse: 'Not New Zealand',
    },
    options: options8,
  },
  {
    id: 356,
    from: '19_aliasNodes.test.ts › Alias Nodes: Multiple aliases',
    expression: {
      operator: '+',
      $orgCategory: { operator: 'objProps', children: ['organisation.category'] },
      values: [
        '$orgCategory',
        '$orgCategory',
        {
          operator: 'stringSubstitution',
          string: '%1, %2, %3',
          substitutions: ['$orgCategory', '$orgCategory', '$orgCategory'],
        },
      ],
    },
    options: options8,
  },
  {
    id: 357,
    from: '19_aliasNodes.test.ts › Alias Nodes: Nested aliases, `evaluateFullObject: true`',
    expression: {
      $flag: {
        $emoji: { operator: '+', values: ['countries.', 'emoji'] },
        operator: 'GraphQL',
        children: [
          'query getCountry($code: String!) {\n            countries(filter: {code: {eq: $code}}) {\n              name\n              emoji\n            }\n          }',
          null,
          ['code'],
          'NZ',
          '$emoji',
        ],
        type: 'string',
      },
      operator: 'stringSubstitution',
      children: ['The flag of New Zealand is %1. Here it is again: %2', '$flag', '$flag'],
    },
    options: {
      data: {
        user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
        organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
        form: { q1: 'Thor', q2: 'Asgard' },
        form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
        application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
      },
      evaluateFullObject: true,
    },
  },
  {
    id: 358,
    from: '19_aliasNodes.test.ts › Alias Nodes: Alias definition missing, return literal string',
    expression: {
      operator: 'stringSubstitution',
      children: ['The flag of New Zealand is %1. Here it is again: %2', '$flag', '$flag'],
    },
    options: options8,
  },
  {
    id: 359,
    from: '19_aliasNodes.test.ts › Alias Nodes: Use same alias reference in inner node, should be redefined',
    expression: {
      operator: '+',
      $orgCategory: { operator: 'objProps', children: ['organisation.category'] },
      values: [
        '$orgCategory',
        '$orgCategory',
        {
          $orgCategory: { operator: 'objProps', children: ['user.title'] },
          operator: 'stringSubstitution',
          string: '%1, %2, %3',
          substitutions: ['$orgCategory', '$orgCategory', '$orgCategory'],
        },
      ],
    },
    options: options8,
  },
  {
    id: 360,
    from: '20_match.test.ts › Basic match',
    expression: {
      operator: 'match',
      matchExpression: 'simple value',
      'another value': 100,
      'simple value': 99,
    },
  },
  {
    id: 361,
    from: '20_match.test.ts › Switch with "branches" object',
    expression: {
      operator: 'switch',
      matchExpression: { operator: 'objectProperties', property: 'weather' },
      branches: {
        sunny: { operator: '+', values: [2, 3, 4] },
        rainy: { operator: '+', values: [9, 9, 9] },
      },
    },
    options: options12,
  },
  {
    id: 362,
    from: '20_match.test.ts › Match with "branches" object built using buildObject',
    expression: {
      operator: 'match',
      matchValue: { operator: 'objectProperties', property: 'weather' },
      branches: {
        operator: 'buildObject',
        properties: [
          { key: 'sunny', value: { operator: '+', values: [2, 3, 4] } },
          { key: 'rainy', value: { operator: '+', values: [9, 9, 9] } },
        ],
      },
    },
    options: options12,
  },
  {
    id: 363,
    from: '20_match.test.ts › Match with children, nested',
    expression: {
      operator: 'match',
      children: [
        { operator: 'objectProperties', property: 'weather' },
        'sunny',
        {
          operator: 'match',
          matchExpression: { operator: 'objProps', property: 'humidity' },
          high: 'NO',
          normal: 'YES',
        },
        'cloudy',
        'YES',
        'rainy',
        {
          operator: 'match',
          matchValue: { operator: 'objProps', property: 'wind' },
          branches: ['strong', 'NO', 'weak', 'YES'],
        },
      ],
    },
    options: options12,
  },
  {
    id: 364,
    from: '20_match.test.ts › Card Game Decision Tree - single player 7+',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: { data: { numberOfPlayers: 1, ageOfYoungestPlayer: 12, preferredDifficulty: 'easy' } },
  },
  {
    id: 365,
    from: '20_match.test.ts › Card Game Decision Tree - single player under 7',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: { data: { numberOfPlayers: 1, ageOfYoungestPlayer: 5, preferredDifficulty: 'easy' } },
  },
  {
    id: 366,
    from: '20_match.test.ts › Card Game Decision Tree - multiple players, some under 5',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: { data: { numberOfPlayers: 3, ageOfYoungestPlayer: 4, preferredDifficulty: 'easy' } },
  },
  {
    id: 367,
    from: '20_match.test.ts › Card Game Decision Tree - multiple players, 5-8',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: { data: { numberOfPlayers: 2, ageOfYoungestPlayer: 5, preferredDifficulty: 'easy' } },
  },
  {
    id: 368,
    from: '20_match.test.ts › Card Game Decision Tree - multiple players, 8-12, challenging game',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: {
      data: { numberOfPlayers: 2, ageOfYoungestPlayer: 9, preferredDifficulty: 'challenging' },
    },
  },
  {
    id: 369,
    from: '20_match.test.ts › Card Game Decision Tree - multiple players, 12-16, easy game',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: { data: { numberOfPlayers: 4, ageOfYoungestPlayer: 12, preferredDifficulty: 'easy' } },
  },
  {
    id: 370,
    from: '20_match.test.ts › Card Game Decision Tree - 3 players, 16+, challenging game',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: {
      data: { numberOfPlayers: 3, ageOfYoungestPlayer: 18, preferredDifficulty: 'challenging' },
    },
  },
  {
    id: 371,
    from: '20_match.test.ts › Card Game Decision Tree - 4 players, 16+, challenging game',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: {
      data: { numberOfPlayers: 4, ageOfYoungestPlayer: 16, preferredDifficulty: 'challenging' },
    },
  },
  {
    id: 372,
    from: '20_match.test.ts › Card Game Decision Tree - 4 players, 16+, hard game',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: { data: { numberOfPlayers: 4, ageOfYoungestPlayer: 16, preferredDifficulty: 'hard' } },
  },
  {
    id: 373,
    from: '20_match.test.ts › Card Game Decision Tree - No match error',
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
    options: {
      data: { numberOfPlayers: 4, ageOfYoungestPlayer: 16, preferredDifficulty: 'other' },
    },
  },
  {
    id: 374,
    from: '20_match.test.ts › Match - invalid branches',
    expression: { $match: { matchValue: 'three', branches: 'not an object or array' } },
  },
  {
    id: 375,
    from: '21_evaluateWholeObject.test.ts › Evaluate whole object',
    expression: {
      outerObject: {
        '2': {
          a: 'A',
          b: { operator: '+', values: [1, 2, 3] },
          another: { operator: 'objProps', property: 'user.title' },
        },
        one: 1,
      },
    },
    options: options13,
  },
  {
    id: 376,
    from: "21_evaluateWholeObject.test.ts › Don't evaluate whole object",
    expression: {
      outerObject: {
        '2': {
          a: 'A',
          b: { operator: '+', values: [1, 2, 3] },
          another: { operator: 'objProps', property: 'user.title' },
        },
        one: 1,
      },
    },
    options: options8,
  },
  {
    id: 377,
    from: '21_evaluateWholeObject.test.ts › Multiple levels of deep operator nodes, with alias node',
    expression: {
      outer: {
        operator: '+',
        values: [
          { six: '$six' },
          { two: { notOperator: 'OK', isOperator: { operator: '+', values: [1, 2, 3] } } },
          { three: 3 },
        ],
        $six: { operator: '+', values: [1, 2, 3] },
      },
    },
    options: options13,
  },
  {
    id: 378,
    from: '21_evaluateWholeObject.test.ts › Evaluate alias nodes even if not within operator node',
    expression: {
      $testAlias: { operator: 'getData', property: 'user.title' },
      type: 'Control',
      text: '$testAlias',
    },
    options: options13,
  },
  {
    id: 379,
    from: '22_fragments.test.ts › Fragments, single parameter at root',
    expression: { fragment: 'getFlag', $country: 'New Zealand' },
    options: options14,
  },
  {
    id: 380,
    from: '22_fragments.test.ts › Join two fragments together, one simple, one using a single "parameter")',
    expression: {
      operator: '+',
      values: [
        { fragment: 'simpleFragment' },
        {
          fragment: 'getFlag',
          parameters: { $country: { operator: 'getData', property: 'myCountry' } },
        },
      ],
    },
    options: options14,
  },
  {
    id: 381,
    from: '22_fragments.test.ts › Fragment used multiple times in an expression (with different parameters (nested))',
    expression: {
      operator: '+',
      values: [
        { fragment: 'adder', $values: [7, 8, 9] },
        {
          fragment: 'adder',
          parameters: {
            $values: [
              { fragment: 'getFlag', $country: 'New Zealand' },
              {
                fragment: 'getFlag',
                parameters: { $country: { operator: 'getData', property: 'myCountry' } },
              },
            ],
          },
        },
      ],
      type: 'array',
    },
    options: options14,
  },
  {
    id: 382,
    from: '22_fragments.test.ts › Use old and new fragments',
    expression: {
      fragment: 'adder',
      $values: [
        {
          fragment: 'getCountryData',
          $country: { operator: 'getData', property: 'variables.country' },
          $field: { operator: 'getData', property: 'variables.field' },
        },
        ', ',
        {
          fragment: 'getCountryData',
          $country: { operator: 'getData', property: 'variables.country' },
          $field: { operator: 'getData', property: 'variables.otherField' },
        },
      ],
    },
    options: {
      fragments: {
        getCountryData: {
          operator: 'GET',
          url: {
            operator: 'stringSubstitution',
            string: 'https://restcountries.com/v3.1/name/%1',
            replacements: ['$country'],
          },
          returnProperty: { operator: '+', values: ['[0].', '$field'] },
        },
        falsy: false,
        falsy2: null,
        falsy3: '',
        falsy4: 0,
        truthy: true,
        addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
        weatherMatcher: {
          operator: 'match',
          children: [
            { operator: 'objectProperties', property: 'weather' },
            'sunny',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'humidity' },
              high: 'NO',
              normal: 'YES',
            },
            'cloudy',
            'YES',
            'rainy',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'wind' },
              branches: ['strong', 'NO', 'weak', 'YES'],
            },
          ],
        },
        getFlag: {
          operator: 'GET',
          children: [
            {
              operator: 'stringSubstitution',
              string: 'https://restcountries.com/v3.1/name/%1',
              replacements: ['$country'],
            },
            [],
            'flag',
          ],
          outputType: 'string',
          metadata: {
            parameters: [
              { name: '$country', type: 'string', required: true, default: 'New Zealand' },
            ],
          },
        },
        simpleFragment: 'The flag of Brazil is: ',
        adder: { operator: '+', values: '$values' },
      },
      data: {
        myCountry: 'Brazil',
        variables: { country: 'New Zealand', field: 'capital[0]', otherField: 'name.common' },
      },
    },
  },
  {
    id: 383,
    from: '22_fragments.test.ts › Same thing but with different data object',
    expression: {
      fragment: 'adder',
      $values: [
        {
          fragment: 'getCountryData',
          $country: { operator: 'getData', property: 'variables.country' },
          $field: { operator: 'getData', property: 'variables.field' },
        },
        ', ',
        {
          fragment: 'getCountryData',
          $country: { operator: 'getData', property: 'variables.country' },
          $field: { operator: 'getData', property: 'variables.otherField' },
        },
      ],
    },
    options: {
      fragments: {
        getCountryData: {
          operator: 'GET',
          url: {
            operator: 'stringSubstitution',
            string: 'https://restcountries.com/v3.1/name/%1',
            replacements: ['$country'],
          },
          returnProperty: { operator: '+', values: ['[0].', '$field'] },
        },
        falsy: false,
        falsy2: null,
        falsy3: '',
        falsy4: 0,
        truthy: true,
        addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
        weatherMatcher: {
          operator: 'match',
          children: [
            { operator: 'objectProperties', property: 'weather' },
            'sunny',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'humidity' },
              high: 'NO',
              normal: 'YES',
            },
            'cloudy',
            'YES',
            'rainy',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'wind' },
              branches: ['strong', 'NO', 'weak', 'YES'],
            },
          ],
        },
        getFlag: {
          operator: 'GET',
          children: [
            {
              operator: 'stringSubstitution',
              string: 'https://restcountries.com/v3.1/name/%1',
              replacements: ['$country'],
            },
            [],
            'flag',
          ],
          outputType: 'string',
          metadata: {
            parameters: [
              { name: '$country', type: 'string', required: true, default: 'New Zealand' },
            ],
          },
        },
        simpleFragment: 'The flag of Brazil is: ',
        adder: { operator: '+', values: '$values' },
      },
      data: {
        myCountry: 'Brazil',
        variables: { country: 'Australia', field: 'tld[0]', otherField: 'region' },
      },
    },
  },
  {
    id: 384,
    from: '22_fragments.test.ts › Add a new fragment to current evaluation options',
    expression: {
      fragment: 'adder',
      parameters: { $values: [{ fragment: 'basic' }, { fragment: 'basic' }] },
    },
    options: {
      fragments: {
        getCountryData: {
          operator: 'GET',
          url: {
            operator: 'stringSubstitution',
            string: 'https://restcountries.com/v3.1/name/%1',
            replacements: ['$country'],
          },
          returnProperty: { operator: '+', values: ['[0].', '$field'] },
        },
        falsy: false,
        falsy2: null,
        falsy3: '',
        falsy4: 0,
        truthy: true,
        addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
        weatherMatcher: {
          operator: 'match',
          children: [
            { operator: 'objectProperties', property: 'weather' },
            'sunny',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'humidity' },
              high: 'NO',
              normal: 'YES',
            },
            'cloudy',
            'YES',
            'rainy',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'wind' },
              branches: ['strong', 'NO', 'weak', 'YES'],
            },
          ],
        },
        getFlag: {
          operator: 'GET',
          children: [
            {
              operator: 'stringSubstitution',
              string: 'https://restcountries.com/v3.1/name/%1',
              replacements: ['$country'],
            },
            [],
            'flag',
          ],
          outputType: 'string',
          metadata: {
            parameters: [
              { name: '$country', type: 'string', required: true, default: 'New Zealand' },
            ],
          },
        },
        simpleFragment: 'The flag of Brazil is: ',
        adder: { operator: '+', values: '$values' },
        basic: 'SimpleText',
      },
      data: { myCountry: 'Brazil' },
    },
  },
  {
    id: 385,
    from: '22_fragments.test.ts › Missing fragment',
    expression: { fragment: 'newFragment', parameters: { $temp: "Doesn't matter" } },
    options: options15,
  },
  {
    id: 386,
    from: '22_fragments.test.ts › Missing fragment with fallback',
    expression: {
      fragment: 'newFragment',
      fallback: { fragment: 'adder', $values: ['This appears', ' ', 'instead'] },
    },
    options: options15,
  },
  {
    id: 387,
    from: '22_fragments.test.ts › Using a decision tree as a fragment',
    expression: { fragment: 'weatherMatcher' },
    options: {
      fragments: {
        getCountryData: {
          operator: 'GET',
          url: {
            operator: 'stringSubstitution',
            string: 'https://restcountries.com/v3.1/name/%1',
            replacements: ['$country'],
          },
          returnProperty: { operator: '+', values: ['[0].', '$field'] },
        },
        falsy: false,
        falsy2: null,
        falsy3: '',
        falsy4: 0,
        truthy: true,
        addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
        weatherMatcher: {
          operator: 'match',
          children: [
            { operator: 'objectProperties', property: 'weather' },
            'sunny',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'humidity' },
              high: 'NO',
              normal: 'YES',
            },
            'cloudy',
            'YES',
            'rainy',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'wind' },
              branches: ['strong', 'NO', 'weak', 'YES'],
            },
          ],
        },
        getFlag: {
          operator: 'GET',
          children: [
            {
              operator: 'stringSubstitution',
              string: 'https://restcountries.com/v3.1/name/%1',
              replacements: ['$country'],
            },
            [],
            'flag',
          ],
          outputType: 'string',
          metadata: {
            parameters: [
              { name: '$country', type: 'string', required: true, default: 'New Zealand' },
            ],
          },
        },
        simpleFragment: 'The flag of Brazil is: ',
        adder: { operator: '+', values: '$values' },
      },
      data: { myCountry: 'Brazil', weather: 'rainy', humidity: 'high', wind: 'strong' },
    },
  },
  {
    id: 388,
    from: '22_fragments.test.ts › Using a fragment as an alias node',
    expression: {
      operator: '?',
      $getNZ: { fragment: 'getCountryData', $country: 'zealand', $field: 'name.common' },
      condition: { operator: '!=', values: ['$getNZ', null] },
      valueIfTrue: '$getNZ',
      valueIfFalse: 'Not New Zealand',
    },
    options: options15,
  },
  {
    id: 389,
    from: '22_fragments.test.ts › Use an alias reference as a Fragment parameter',
    expression: {
      fragment: 'getFlag',
      $country: '$selectedCountry',
      $selectedCountry: {
        operator: 'getData',
        property: 'myFavouriteCountry',
        fallback: 'Country not found',
      },
    },
    options: {
      fragments: {
        getCountryData: {
          operator: 'GET',
          url: {
            operator: 'stringSubstitution',
            string: 'https://restcountries.com/v3.1/name/%1',
            replacements: ['$country'],
          },
          returnProperty: { operator: '+', values: ['[0].', '$field'] },
        },
        falsy: false,
        falsy2: null,
        falsy3: '',
        falsy4: 0,
        truthy: true,
        addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
        weatherMatcher: {
          operator: 'match',
          children: [
            { operator: 'objectProperties', property: 'weather' },
            'sunny',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'humidity' },
              high: 'NO',
              normal: 'YES',
            },
            'cloudy',
            'YES',
            'rainy',
            {
              operator: 'match',
              matchExpression: { operator: 'objProps', property: 'wind' },
              branches: ['strong', 'NO', 'weak', 'YES'],
            },
          ],
        },
        getFlag: {
          operator: 'GET',
          children: [
            {
              operator: 'stringSubstitution',
              string: 'https://restcountries.com/v3.1/name/%1',
              replacements: ['$country'],
            },
            [],
            'flag',
          ],
          outputType: 'string',
          metadata: {
            parameters: [
              { name: '$country', type: 'string', required: true, default: 'New Zealand' },
            ],
          },
        },
        simpleFragment: 'The flag of Brazil is: ',
        adder: { operator: '+', values: '$values' },
      },
      data: { myCountry: 'Brazil', myFavouriteCountry: 'New Zealand' },
    },
  },
  {
    id: 390,
    from: '22_fragments.test.ts › Fragment references another fragment 🙄',
    expression: { fragment: 'addAndDouble', $numbers: [3, 4, 5] },
    options: options15,
  },
  {
    id: 391,
    from: '22_fragments.test.ts › Fragment uses default parameter value',
    expression: { fragment: 'getFlag' },
    options: options15,
  },
  {
    id: 392,
    from: '22_fragments.test.ts › Fragment values are falsy',
    expression: [
      { fragment: 'falsy' },
      { fragment: 'falsy2' },
      { fragment: 'falsy3' },
      { fragment: 'falsy4' },
      { fragment: 'truthy' },
    ],
    options: options15,
  },
  {
    id: 393,
    from: '23_shorthand.test.ts › Shorthand - evaluate simple single-value expression',
    expression: { $getData: 'deep.p' },
    options: options16,
  },
  {
    id: 394,
    from: '23_shorthand.test.ts › Shorthand - evaluate nested expression',
    expression: { $plus: [{ $getData: 'myCountry' }, { $getData: 'otherCountry' }] },
    options: options16,
  },
  {
    id: 395,
    from: '23_shorthand.test.ts › Shorthand - evaluate simple object expression',
    expression: { $plus: [1, 2, 3] },
    options: options16,
  },
  {
    id: 396,
    from: '23_shorthand.test.ts › Shorthand - evaluate nested object expression',
    expression: { $plus: [{ $getData: 'user.firstName' }, ' ', { $getData: 'user.lastName' }] },
    options: options16,
  },
  {
    id: 397,
    from: '23_shorthand.test.ts › Shorthand - evaluate fragment',
    expression: { $getFlag: { $country: { $getData: 'myCountry' } } },
    options: options16,
  },
  {
    id: 398,
    from: '23_shorthand.test.ts › Shorthand - custom function',
    expression: { $function: ['getPrincess', 'Leia'] },
    options: options16,
  },
  {
    id: 399,
    from: '23_shorthand.test.ts › Shorthand - custom function with named properties',
    expression: { $function: { functionPath: 'getPrincess', input: 'Diana' } },
    options: options16,
  },
  {
    id: 400,
    from: '23_shorthand.test.ts › Shorthand - with alias fallback',
    expression: {
      $plus: [{ operator: 'objProps', property: 'cant.find.this', fallback: '$myFallback' }],
      $myFallback: 'EMPIRE',
    },
    options: options16,
  },
  {
    id: 401,
    from: '23_shorthand.test.ts › Shorthand - with node as direct parameter',
    expression: { $objProps: { $plus: ['user.', 'lastName'] } },
    options: options16,
  },
  {
    id: 402,
    from: '23_shorthand.test.ts › Shorthand - with operator and named parameter',
    expression: { $getData: { property: 'user.firstName' } },
    options: options16,
  },
  {
    id: 403,
    from: '23_shorthand.test.ts › Shorthand - nested fragments',
    expression: {
      $plus: [
        { $adder: { $values: [7, 8, 9] } },
        {
          $adder: {
            $buildObject: [
              '$values',
              [
                { $getFlag: { $country: 'New Zealand' } },
                { $getFlag: { $country: { operator: 'getData', property: 'myCountry' } } },
              ],
            ],
          },
        },
      ],
      type: 'array',
    },
    options: options16,
  },
  {
    id: 404,
    from: '23_shorthand.test.ts › Shorthand - mixed fragments & operators with multiple syntaxes',
    expression: {
      $adder: {
        $values: [
          {
            fragment: 'getCountryData',
            $country: { $getData: 'variables.country' },
            $field: { $getData: 'variables.field' },
          },
          ', ',
          {
            $getCountryData: {
              $country: { $getData: { property: 'variables.country' } },
              $field: { $getData: { property: 'variables.otherField' } },
            },
          },
        ],
      },
    },
    options: {
      functions: { getPrincess: (name) => `Princess ${name}` },
      fragments: {
        getCountryData: {
          operator: 'GET',
          url: {
            operator: 'stringSubstitution',
            string: 'https://restcountries.com/v3.1/name/%1',
            replacements: ['$country'],
          },
          returnProperty: { operator: '+', values: ['[0].', '$field'] },
        },
        getFlag: {
          operator: 'GET',
          children: [
            {
              operator: 'stringSubstitution',
              string: 'https://restcountries.com/v3.1/name/%1',
              replacements: ['$country'],
            },
            [],
            'flag',
          ],
          outputType: 'string',
        },
        simpleFragment: 'The flag of Brazil is: ',
        adder: { operator: '+', values: '$values' },
        shorthandFragment: { $stringSubstitution: ['My name is %1', '$name'] },
      },
      data: {
        myCountry: 'Brazil',
        otherCountry: 'France',
        deep: { p: 12 },
        user: { firstName: 'Bruce', lastName: 'Banner' },
        variables: { country: 'New Zealand', field: 'capital[0]', otherField: 'name.common' },
      },
    },
  },
  {
    id: 405,
    from: '23_shorthand.test.ts › Shorthand - fragment is in shorthand syntax',
    expression: { fragment: 'shorthandFragment', $name: 'Slim Shady' },
    options: options17,
  },
  {
    id: 406,
    from: '23_shorthand.test.ts › Shorthand - shorthand fragment with shorthand expression',
    expression: { $shorthandFragment: { $name: 'Slim Shady' } },
    options: options17,
  },
  {
    id: 407,
    from: '26_convert.test.ts › Convert to V2 -- basic',
    expression: {
      operator: 'AND',
      children: [
        {
          operator: '=',
          children: [
            {
              operator: 'objectProperties',
              children: ['responses.alreadyRegistered.optionIndex', null],
            },
            0,
          ],
        },
        {
          operator: '!=',
          children: [
            {
              operator: 'objectProperties',
              children: ['responses.provProdSelect.selection', null],
            },
            null,
          ],
        },
      ],
    },
    options: options18,
  },
  {
    id: 408,
    from: '26_convert.test.ts › Convert to V2 -- basic',
    expression: {
      operator: 'and',
      values: [
        {
          operator: '=',
          values: [
            {
              operator: 'getData',
              property: 'responses.alreadyRegistered.optionIndex',
              fallback: null,
            },
            0,
          ],
        },
        {
          operator: '!=',
          values: [
            { operator: 'getData', property: 'responses.provProdSelect.selection', fallback: null },
            null,
          ],
        },
      ],
    },
    options: options18,
  },
  {
    id: 409,
    from: '26_convert.test.ts › Convert to V2 -- more complex',
    expression: {
      children: [
        {
          children: [
            {
              children: [
                {
                  children: ['responses.alreadyRegistered.optionIndex', null],
                  operator: 'objectProperties',
                },
                0,
              ],
              operator: '=',
            },
            {
              children: [
                { children: ['responses.provProdSelect', null], operator: 'objectProperties' },
                null,
              ],
              operator: '!=',
            },
          ],
          operator: 'AND',
        },
        {
          children: ['responses.provProdSelect.selection.tradeName', null],
          operator: 'objectProperties',
        },
        {
          children: [
            {
              children: [
                {
                  children: [
                    {
                      children: ['responses.preregSelect.optionIndex', ''],
                      operator: 'objectProperties',
                    },
                    0,
                  ],
                  operator: '=',
                },
                {
                  children: [
                    {
                      children: ['responses.preregSelect.optionIndex', ''],
                      operator: 'objectProperties',
                    },
                    1,
                  ],
                  operator: '=',
                },
              ],
              operator: 'OR',
            },
            {
              children: ['responses.prodSelect.selection[0].tradeName', null],
              operator: 'objectProperties',
            },
            null,
          ],
          operator: '?',
        },
      ],
      operator: '?',
    },
    options: options18,
  },
  {
    id: 410,
    from: '26_convert.test.ts › Convert to V2 -- more complex',
    expression: {
      operator: '?',
      condition: {
        operator: 'and',
        values: [
          {
            operator: '=',
            values: [
              {
                operator: 'getData',
                property: 'responses.alreadyRegistered.optionIndex',
                fallback: null,
              },
              0,
            ],
          },
          {
            operator: '!=',
            values: [
              { operator: 'getData', property: 'responses.provProdSelect', fallback: null },
              null,
            ],
          },
        ],
      },
      valueIfTrue: {
        operator: 'getData',
        property: 'responses.provProdSelect.selection.tradeName',
        fallback: null,
      },
      valueIfFalse: {
        operator: '?',
        condition: {
          operator: 'or',
          values: [
            {
              operator: '=',
              values: [
                {
                  operator: 'getData',
                  property: 'responses.preregSelect.optionIndex',
                  fallback: '',
                },
                0,
              ],
            },
            {
              operator: '=',
              values: [
                {
                  operator: 'getData',
                  property: 'responses.preregSelect.optionIndex',
                  fallback: '',
                },
                1,
              ],
            },
          ],
        },
        valueIfTrue: {
          operator: 'getData',
          property: 'responses.prodSelect.selection[0].tradeName',
          fallback: null,
        },
        valueIfFalse: null,
      },
    },
    options: options18,
  },
  {
    id: 411,
    from: '26_convert.test.ts › Convert to V2 -- String Substitution',
    expression: {
      children: [
        '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
        { children: ['applicationData.applicationSerial', null], operator: 'objectProperties' },
        { children: ['applicationData.firstName', null], operator: 'objectProperties' },
        { children: ['applicationData.lastName', '  '], operator: 'objectProperties' },
        {
          operator: 'GraphQL',
          children: [
            'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
            'https://countries.trevorblades.com/',
            [],
          ],
        },
      ],
      operator: 'stringSubstitution',
    },
    options: options18,
  },
  {
    id: 412,
    from: '26_convert.test.ts › Convert to V2 -- String Substitution',
    expression: {
      operator: 'stringSubstitution',
      string:
        '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
      substitutions: [
        { operator: 'getData', property: 'applicationData.applicationSerial', fallback: null },
        { operator: 'getData', property: 'applicationData.firstName', fallback: null },
        { operator: 'getData', property: 'applicationData.lastName', fallback: '  ' },
        {
          operator: 'graphQL',
          query:
            'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
          url: 'https://countries.trevorblades.com/',
          variables: {},
        },
      ],
    },
    options: options18,
  },
  {
    id: 413,
    from: '26_convert.test.ts › Convert to V2 -- trickier operators',
    expression: {
      operator: 'buildObject',
      children: [
        'someKey',
        'someValue',
        { operator: 'objectFunctions', children: ['functions.getSomething', 'arg1', 'arg2'] },
        {
          operator: 'GET',
          children: [
            { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
            ['fullText', 'fields'],
            'true',
            'name,capital,flag',
            'capital',
          ],
          type: 'string',
        },
      ],
    },
    options: options18,
  },
  {
    id: 414,
    from: '26_convert.test.ts › Convert to V2 -- trickier operators',
    expression: {
      operator: 'buildObject',
      properties: [
        { key: 'someKey', value: 'someValue' },
        {
          key: {
            operator: 'customFunctions',
            functionName: 'functions.getSomething',
            args: ['arg1', 'arg2'],
          },
          value: {
            operator: 'GET',
            outputType: 'string',
            url: { operator: '+', values: ['https://restcountries.com/v3.1/name/', 'cuba'] },
            parameters: { fullText: 'true', fields: 'name,capital,flag' },
            returnProperty: 'capital',
          },
        },
      ],
    },
    options: options18,
  },
  {
    id: 415,
    from: '26_convert.test.ts › Convert to V2 -- already partially converted',
    expression: {
      operator: '?',
      $getNZ: {
        operator: 'GET',
        children: ['https://restcountries.com/v3.1/name/zealand', [], 'name.common'],
        type: 'string',
      },
      condition: { operator: '!=', values: ['$getNZ', null] },
      valueIfTrue: '$getNZ',
      valueIfFalse: 'Not New Zealand',
    },
    options: options18,
  },
  {
    id: 416,
    from: '26_convert.test.ts › Convert to V2 -- already partially converted',
    expression: {
      operator: '?',
      $getNZ: {
        operator: 'GET',
        outputType: 'string',
        url: 'https://restcountries.com/v3.1/name/zealand',
        parameters: {},
        returnProperty: 'name.common',
      },
      condition: { operator: '!=', values: ['$getNZ', null] },
      valueIfTrue: '$getNZ',
      valueIfFalse: 'Not New Zealand',
    },
    options: options18,
  },
  {
    id: 417,
    from: '26_convert.test.ts › Convert to Shorthand -- basic',
    expression: {
      $stringSubstitution: {
        string:
          '**%1**\n**%2 %3**\n \nDear %2 %3,\n \nYour application for a permit to import medical products has been  successfully submitted.\n\nThe application will be reviewed and the outcome provided to you via email.\n \nKind regards,  \n%4\n\n',
        substitutions: [
          { $getData: ['applicationData.applicationSerial', null] },
          { $getData: ['applicationData.firstName', null] },
          { $getData: ['applicationData.lastName', '  '] },
          {
            $graphQL: {
              query:
                'query getCountries {\n                countries(filter: {continent: {eq: "OC"}}) {\n                  name\n                }\n              }',
              url: 'https://countries.trevorblades.com/',
              variables: {},
            },
          },
        ],
      },
    },
    options: options18,
  },
  {
    id: 418,
    from: '26_convert.test.ts › Convert to Shorthand -- bigger, with some nodes already shorthand',
    expression: {
      operator: '?',
      condition: {
        operator: 'or',
        values: [
          {
            operator: '>',
            values: [{ $getData: 'patron.age' }, { $getData: 'film.minAgeRating' }],
            strict: false,
          },
          {
            operator: 'and',
            values: [
              { operator: '>', values: [{ $getData: 'patron.age' }, 13], strict: false },
              { $getData: 'patron.isParentAttending' },
            ],
          },
        ],
      },
      valueIfTrue: {
        operator: 'stringSubstitution',
        string: 'Enjoy "{{movie}}"! 🍿🎬',
        substitutions: { movie: { operator: 'getData', property: 'film.title' } },
      },
      valueIfFalse: "Sorry, try again when you're older 😔",
    },
    options: options18,
  },
  {
    id: 419,
    from: '26_convert.test.ts › Convert to Shorthand -- bigger, with some nodes already shorthand',
    expression: {
      $conditional: {
        condition: {
          $or: [
            {
              $greaterThan: {
                values: [{ $getData: 'patron.age' }, { $getData: 'film.minAgeRating' }],
                strict: false,
              },
            },
            {
              $and: [
                { $greaterThan: { values: [{ $getData: 'patron.age' }, 13], strict: false } },
                { $getData: 'patron.isParentAttending' },
              ],
            },
          ],
        },
        valueIfTrue: {
          $stringSubstitution: ['Enjoy "{{movie}}"! 🍿🎬', { movie: { $getData: 'film.title' } }],
        },
        valueIfFalse: "Sorry, try again when you're older 😔",
      },
    },
    options: options18,
  },
  {
    id: 420,
    from: '26_convert.test.ts › Convert to Shorthand -- fragments',
    expression: {
      operator: '+',
      values: [
        { fragment: 'adder', $values: [7, 8, 9] },
        {
          fragment: 'adder',
          parameters: {
            $values: [
              { fragment: 'getFlag', $country: 'New Zealand' },
              {
                fragment: 'getFlag',
                parameters: { $country: { operator: 'getData', property: 'myCountry' } },
              },
            ],
          },
        },
        { fragment: 'Frag With Spaces', $values: [7, 8, 9] },
        { fragment: 'FragWithoutSpaces', $values: [7, 8, 9] },
      ],
      type: 'array',
    },
    options: options18,
  },
  {
    id: 421,
    from: '26_convert.test.ts › Convert to Shorthand -- fragments',
    expression: {
      $plus: {
        values: [
          { $adder: { $values: [7, 8, 9] } },
          {
            $adder: {
              $values: [
                { $getFlag: { $country: 'New Zealand' } },
                { $getFlag: { $country: { $getData: 'myCountry' } } },
              ],
            },
          },
          { '$Frag With Spaces': { $values: [7, 8, 9] } },
          { $FragWithoutSpaces: { $values: [7, 8, 9] } },
        ],
        type: 'array',
      },
    },
    options: options18,
  },
  {
    id: 422,
    from: '26_convert.test.ts › Convert to Shorthand -- normal node with Fallback',
    expression: {
      operator: 'and',
      values: [
        { operator: '>', values: [{ $getData: 'patron.age' }, 13] },
        { $getData: 'patron.isParentAttending' },
      ],
      fallback: 'This should show up',
    },
    options: options18,
  },
  {
    id: 423,
    from: '26_convert.test.ts › Convert to Shorthand -- normal node with Fallback',
    expression: {
      $and: {
        values: [
          { $greaterThan: [{ $getData: 'patron.age' }, 13] },
          { $getData: 'patron.isParentAttending' },
        ],
        fallback: 'This should show up',
      },
    },
    options: options18,
  },
  {
    id: 424,
    from: '26_convert.test.ts › Convert to Shorthand -- lots of node types',
    expression: [
      { operator: 'buildObject', values: ['someKey', { operator: '+', values: [1, 2, 3] }] },
      {
        operator: 'buildObject',
        values: [
          {
            key: 'someKey',
            value: { operator: 'objProps', property: 'testing.this', fallback: 'Internal' },
          },
        ],
        fallback: 'Okay then',
      },
      {
        operator: 'length',
        values: [
          'someKey',
          { operator: '+', values: [1, 2, 3], useCache: true, outputType: 'array' },
        ],
      },
      {
        operator: '=',
        values: [
          { operator: 'equals', values: [1, 1, 2] },
          { operator: 'eq', values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' },
          { operator: 'equal', values: [null, undefined], nullEqualsUndefined: true },
        ],
      },
      {
        operator: '?',
        $getNZ: {
          operator: 'GET',
          url: 'https://restcountries.com/v3.1/name/zealand',
          returnProperty: 'name.common',
          outputType: 'string',
        },
        condition: { operator: '!=', values: ['$getNZ', null] },
        valueIfTrue: '$getNZ',
        valueIfFalse: 'Not New Zealand',
      },
      {
        operator: 'passThru',
        value: { operator: 'PASS_THRU', value: [1, 2, { operator: 'pass', value: 'ONE' }] },
      },
      {
        operator: 'Match',
        matchExpression: { operator: 'getData', property: 'film.title' },
        branches: {
          'Deadpool & Wolverine': {
            '17': 'OKAY',
            '69': 'Nope',
            operator: 'match',
            matchValue: { operator: 'getData', property: 'film.minAgeRating' },
          },
          Other: 420,
        },
      },
    ],
    options: options18,
  },
  {
    id: 425,
    from: '26_convert.test.ts › Convert to Shorthand -- lots of node types',
    expression: [
      { $buildObject: ['someKey', { $plus: [1, 2, 3] }] },
      {
        $buildObject: {
          values: [{ key: 'someKey', value: { $getData: ['testing.this', 'Internal'] } }],
          fallback: 'Okay then',
        },
      },
      {
        $count: ['someKey', { $plus: { values: [1, 2, 3], useCache: true, outputType: 'array' } }],
      },
      {
        $eq: [
          { $eq: [1, 1, 2] },
          { $eq: { values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' } },
          { $eq: { values: [null, undefined], nullEqualsUndefined: true } },
        ],
      },
      {
        $conditional: {
          condition: { $notEqual: ['$getNZ', null] },
          valueIfTrue: '$getNZ',
          valueIfFalse: 'Not New Zealand',
        },
        $getNZ: {
          $GET: {
            url: 'https://restcountries.com/v3.1/name/zealand',
            returnProperty: 'name.common',
            outputType: 'string',
          },
        },
      },
      { $pass: { $pass: { value: [1, 2, { $pass: 'ONE' }] } } },
      {
        $match: {
          matchExpression: { $getData: 'film.title' },
          branches: {
            'Deadpool & Wolverine': {
              $match: { '17': 'OKAY', '69': 'Nope', matchValue: { $getData: 'film.minAgeRating' } },
            },
            Other: 420,
          },
        },
      },
    ],
    options: options18,
  },
  {
    id: 426,
    from: '26_convert.test.ts › Convert to Shorthand -- array operator in positional "children" form',
    expression: { operator: '+', children: [10, 20, 30] },
    options: options18,
  },
  {
    id: 427,
    from: '26_convert.test.ts › Convert to Shorthand -- array operator in positional "children" form',
    expression: { $plus: [10, 20, 30] },
    options: options18,
  },
  {
    id: 428,
    from: '26_convert.test.ts › Convert to Shorthand -- operator with custom parseChildren in "children" form',
    expression: { operator: 'conditional', children: [true, 'YES', 'NO'] },
    options: options18,
  },
  {
    id: 429,
    from: '26_convert.test.ts › Convert to Shorthand -- operator with custom parseChildren in "children" form',
    expression: { $conditional: { condition: true, valueIfTrue: 'YES', valueIfFalse: 'NO' } },
    options: options18,
  },
  {
    id: 430,
    from: '26_convert.test.ts › Convert to Shorthand -- buildObject using "values" alias collapses to array form',
    expression: { operator: 'buildObject', values: [{ key: 'name', value: 'Tom' }] },
    options: options18,
  },
  {
    id: 431,
    from: '26_convert.test.ts › Convert to Shorthand -- buildObject using "values" alias collapses to array form',
    expression: { $buildObject: [{ key: 'name', value: 'Tom' }] },
    options: options18,
  },
  {
    id: 432,
    from: '26_convert.test.ts › Convert to Shorthand -- Custom operators/functions',
    expression: {
      operator: 'changeCase',
      toCase: { operator: 'getData', property: 'toCase' },
      string: {
        operator: '+',
        values: [
          { operator: 'reverse', args: [{ operator: 'getData', property: 'backwardsInput' }] },
          { operator: 'currentDate' },
          { operator: 'reverse', input: [1, 2, 3, 4] },
        ],
      },
    },
    options: options18,
  },
  {
    id: 433,
    from: '26_convert.test.ts › Convert to Shorthand -- Custom operators/functions',
    expression: {
      $changeCase: {
        toCase: { $getData: 'toCase' },
        string: {
          $plus: [
            { $reverse: [{ $getData: 'backwardsInput' }] },
            { $currentDate: {} },
            { $reverse: { input: [1, 2, 3, 4] } },
          ],
        },
      },
    },
    options: options18,
  },
  {
    id: 434,
    from: '26_convert.test.ts › Convert to Shorthand -- getData with additionalProperties',
    expression: {
      operator: 'getData',
      property: 'name',
      additionalData: '$character',
      $character: { name: 'Spider-Man' },
    },
    options: options18,
  },
  {
    id: 435,
    from: '26_convert.test.ts › Convert to Shorthand -- getData with additionalProperties',
    expression: {
      $getData: { property: 'name', additionalData: '$character' },
      $character: { name: 'Spider-Man' },
    },
    options: options18,
  },
  {
    id: 436,
    from: '26_convert.test.ts › Convert to Shorthand -- buildObject with nested getDatas',
    expression: {
      operator: 'buildObject',
      properties: [
        {
          key: 'text',
          value: { operator: 'objectProperties', children: ['applicationData.firstName'] },
        },
      ],
    },
    options: options18,
  },
  {
    id: 437,
    from: '26_convert.test.ts › Convert to Shorthand -- buildObject with nested getDatas',
    expression: {
      $buildObject: [{ key: 'text', value: { $getData: 'applicationData.firstName' } }],
    },
    options: options18,
  },
  {
    id: 438,
    from: '26_convert.test.ts › Convert to Shorthand -- complex with alias nodes',
    expression: {
      operator: 'stringSubstitution',
      string: 'Name: %1\nGender: %2\nHomeworld: %3\nFirst appearance: %4',
      substitutions: [
        { operator: 'getData', property: 'name', additionalData: '$character' },
        { operator: 'getData', property: 'gender', additionalData: '$character' },
        {
          operator: 'get',
          url: { operator: 'getData', property: 'homeworld', additionalData: '$character' },
          returnProperty: 'name',
        },
        {
          operator: 'get',
          url: { operator: 'getData', property: 'films[0]', additionalData: '$character' },
          returnProperty: 'title',
        },
      ],
      fallback: {
        operator: '+',
        values: ["Can't retrieve data for character: ", { $getData: 'selected' }],
        fallback: '‼️',
      },
      $character: {
        operator: 'GET',
        url: {
          operator: '+',
          values: [
            'https://swapi.py4e.com/api/people/',
            {
              operator: 'getData',
              property: {
                operator: 'substitute',
                string: 'characters.%1',
                substitutions: [{ operator: 'getData', property: 'selected' }],
              },
            },
          ],
        },
        fallback: 'Nope',
      },
    },
    options: options18,
  },
  {
    id: 439,
    from: '26_convert.test.ts › Convert to Shorthand -- complex with alias nodes',
    expression: {
      $stringSubstitution: {
        string: 'Name: %1\nGender: %2\nHomeworld: %3\nFirst appearance: %4',
        substitutions: [
          { $getData: { property: 'name', additionalData: '$character' } },
          { $getData: { property: 'gender', additionalData: '$character' } },
          {
            $GET: {
              url: { $getData: { property: 'homeworld', additionalData: '$character' } },
              returnProperty: 'name',
            },
          },
          {
            $GET: {
              url: { $getData: { property: 'films[0]', additionalData: '$character' } },
              returnProperty: 'title',
            },
          },
        ],
        fallback: {
          $plus: {
            values: ["Can't retrieve data for character: ", { $getData: 'selected' }],
            fallback: '‼️',
          },
        },
      },
      $character: {
        $GET: {
          url: {
            $plus: [
              'https://swapi.py4e.com/api/people/',
              {
                $getData: {
                  $stringSubstitution: {
                    string: 'characters.%1',
                    substitutions: [{ $getData: 'selected' }],
                  },
                },
              },
            ],
          },
          fallback: 'Nope',
        },
      },
    },
    options: options18,
  },
  {
    id: 440,
    from: '26_convert.test.ts › Convert to Shorthand -- GET with returnProperty uses object form',
    expression: {
      operator: 'get',
      url: 'https://restcountries.com/v3.1/name/zealand',
      returnProperty: 'name.common',
    },
    options: options18,
  },
  {
    id: 441,
    from: '26_convert.test.ts › Convert to Shorthand -- GET with returnProperty uses object form',
    expression: {
      $GET: { url: 'https://restcountries.com/v3.1/name/zealand', returnProperty: 'name.common' },
    },
    options: options18,
  },
  {
    id: 442,
    from: '26_convert.test.ts › Convert from Shorthand -- bigger, with lots of conditional logic',
    expression: {
      operator: '?',
      condition: {
        operator: 'or',
        values: [
          {
            operator: '>',
            values: [
              { operator: 'getData', property: 'patron.age' },
              { operator: 'getData', property: 'film.minAgeRating' },
            ],
            strict: false,
          },
          {
            operator: 'and',
            values: [
              {
                operator: '>',
                values: [{ operator: 'getData', property: 'patron.age' }, 13],
                strict: false,
              },
              { operator: 'getData', property: 'patron.isParentAttending' },
            ],
          },
        ],
      },
      valueIfTrue: {
        operator: 'stringSubstitution',
        string: 'Enjoy "{{movie}}"! 🍿🎬',
        substitutions: [{ movie: { operator: 'getData', property: 'film.title' } }],
      },
      valueIfFalse: "Sorry, try again when you're older 😔",
    },
    options: options18,
  },
  {
    id: 443,
    from: '26_convert.test.ts › Convert from Shorthand -- fragments',
    expression: {
      $plus: {
        values: [
          { $adder: { $values: [7, 8, 9] } },
          {
            $adder: {
              $values: [
                { $getFlag: { $country: 'New Zealand' } },
                { $getFlag: { $country: { $getData: 'myCountry' } } },
                { '$Frag With Spaces': { $values: [7, 8, 9] } },
                { $FragWithoutSpaces: { $values: [7, 8, 9] } },
              ],
            },
          },
        ],
        type: 'array',
      },
    },
    options: options18,
  },
  {
    id: 444,
    from: '26_convert.test.ts › Convert from Shorthand -- fragments',
    expression: {
      operator: '+',
      values: [
        { fragment: 'adder', $values: [7, 8, 9] },
        {
          fragment: 'adder',
          $values: [
            { fragment: 'getFlag', $country: 'New Zealand' },
            { fragment: 'getFlag', $country: { operator: 'getData', property: 'myCountry' } },
            { fragment: 'Frag With Spaces', $values: [7, 8, 9] },
            { fragment: 'FragWithoutSpaces', $values: [7, 8, 9] },
          ],
        },
      ],
      type: 'array',
    },
    options: options18,
  },
  {
    id: 445,
    from: '26_convert.test.ts › Convert from Shorthand -- normal node with Fallback',
    expression: {
      operator: 'and',
      values: [
        { operator: '>', values: [{ operator: 'getData', property: 'patron.age' }, 13] },
        { operator: 'getData', property: 'patron.isParentAttending' },
      ],
      fallback: 'This should show up',
    },
    options: options18,
  },
  {
    id: 446,
    from: '26_convert.test.ts › Convert from Shorthand -- lots of node types',
    expression: [
      { $buildObject: ['someKey', { $plus: [1, 2, 3] }] },
      {
        $buildObject: {
          values: [{ key: 'someKey', value: { $getData: ['testing.this', 'Internal'] } }],
          fallback: 'Okay then',
        },
      },
      {
        $count: ['someKey', { $plus: { values: [1, 2, 3], useCache: true, outputType: 'array' } }],
      },
      {
        $eq: [
          { $eq: [1, 1, 2] },
          { $eq: { values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' } },
          { $eq: { values: [null, undefined], nullEqualsUndefined: true } },
        ],
      },
      {
        $conditional: {
          condition: { $notEqual: ['$getNZ', null] },
          valueIfTrue: '$getNZ',
          valueIfFalse: 'Not New Zealand',
        },
        $getNZ: {
          $GET: {
            url: 'https://restcountries.com/v3.1/name/zealand',
            returnProperty: 'name.common',
            outputType: 'string',
          },
        },
      },
      { $passThru: { $passThru: { value: [1, 2, { $passThru: 'ONE' }] } } },
      {
        $match: {
          matchExpression: { $getData: 'film.title' },
          branches: {
            'Deadpool & Wolverine': {
              $match: { '17': 'OKAY', '69': 'Nope', matchValue: { $getData: 'film.minAgeRating' } },
            },
            Other: 420,
          },
        },
      },
    ],
    options: options18,
  },
  {
    id: 447,
    from: '26_convert.test.ts › Convert from Shorthand -- lots of node types',
    expression: [
      {
        operator: 'buildObject',
        properties: [{ key: 'someKey', value: { operator: '+', values: [1, 2, 3] } }],
      },
      {
        operator: 'buildObject',
        values: [
          {
            key: 'someKey',
            value: { operator: 'getData', property: 'testing.this', fallback: 'Internal' },
          },
        ],
        fallback: 'Okay then',
      },
      {
        operator: 'count',
        values: [
          'someKey',
          { operator: '+', values: [1, 2, 3], useCache: true, outputType: 'array' },
        ],
      },
      {
        operator: '=',
        values: [
          { operator: '=', values: [1, 1, 2] },
          { operator: '=', values: ['word', 'WORD'], caseInsensitive: true, fallback: 'Ooops' },
          { operator: '=', values: [null, undefined], nullEqualsUndefined: true },
        ],
      },
      {
        operator: '?',
        condition: { operator: '!=', values: ['$getNZ', null] },
        valueIfTrue: '$getNZ',
        valueIfFalse: 'Not New Zealand',
        $getNZ: {
          operator: 'GET',
          url: 'https://restcountries.com/v3.1/name/zealand',
          returnProperty: 'name.common',
          outputType: 'string',
        },
      },
      {
        operator: 'pass',
        value: { operator: 'pass', value: [1, 2, { operator: 'pass', value: 'ONE' }] },
      },
      {
        operator: 'match',
        matchExpression: { operator: 'getData', property: 'film.title' },
        branches: {
          'Deadpool & Wolverine': {
            '17': 'OKAY',
            '69': 'Nope',
            operator: 'match',
            matchValue: { operator: 'getData', property: 'film.minAgeRating' },
          },
          Other: 420,
        },
      },
    ],
    options: options18,
  },
]
