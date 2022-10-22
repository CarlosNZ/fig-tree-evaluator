# fig-tree-evaluator

**FigTree Evaluator** is a module to evaluate JSON-structured expression trees. 

A typical use case would be for evaluating **configuration** files, where you need to store dynamic values or arbitrary logic without allowing users to inject executable code. For example, a [form-builder app](https://github.com/openmsupply/conforma-web-app) might need to allow complex conditional logic for form element visibility based on previous responses, or for validation beyond what is available in standard validation libraries.

A range of built-in operators are available, from simple logic, arithmetic and string manipulation, to data fetching from local sources or remote APIs.

[**Demo/Playground**](LINK)

## Contents <!-- omit in toc -->
<!-- TOC -->
- [The basics](#the-basics)
- [Install](#install)
- [Usage](#usage)
- [Available options](#available-options)
- [Operator nodes](#operator-nodes)
  - [Other common properties:](#other-common-properties)
  - [Operator & Property Aliases](#operator--property-aliases)
- [Operator reference](#operator-reference)
  - [AND](#and)
  - [OR](#or)
  - [EQUAL](#equal)
  - [NOT_EQUAL](#not_equal)
  - [PLUS](#plus)
  - [SUBTRACT](#subtract)
  - [MULTIPLY](#multiply)
  - [DIVIDE](#divide)
  - [GREATER_THAN](#greater_than)
  - [LESS_THAN](#less_than)
  - [COUNT](#count)
  - [CONDITIONAL](#conditional)
  - [REGEX](#regex)
  - [OBJECT_PROPERTIES](#object_properties)
  - [STRING_SUBSTITUTION](#string_substitution)
  - [SPLIT](#split)
  - [GET](#get)
  - [POST](#post)
  - [GRAPHQL](#graphql)
  - [PG_SQL](#pg_sql)
  - [BUILD_OBJECT](#build_object)
  - [PASSTHRU](#passthru)
  - [CUSTOM_FUNCTIONS](#custom_functions)
- [More examples](#more-examples)
- [Development environment](#development-environment)
- [Tests](#tests)
- [Help, Feedback, Suggestions](#help-feedback-suggestions)

<!-- /TOC -->
## The basics

Fig-tree evaluates expressions structured in a JSON/Javascript object [expression tree](https://www.geeksforgeeks.org/expression-tree/). A single "node" of the tree consists of an **Operator**, with associated parameters (or child nodes), each of which can itself be another Operator node -- i.e. a recursive tree structure of arbitrary depth and complexity.

A wide range of [operators are available](#operator-reference), but [custom fuctions](#custom_functions) can be added to your implementation if you wish to extend the base functionality.

For example:

```js
{
    operator: "+", // "Addition" operator
    values: [1, 2, 3]
}
// -> 6
```

Or, with a deeper structure that results in the same final output:
```js
{
  operator: '+',
  values: [
    {
      operator: '?', // conditional
      condition: {
        operator: '=', // equality
        values: [
          {
            operator: 'objectProperties', // extracted from passed-in object
            property: 'responses.Q1',
          },
          'correct',
        ],
      },
      valueIfTrue: 1,
      valueIfFalse: 0,
    },
    {
      operator: 'GET', // API lookup
      url: 'https://my.server.com/api/get-count',
    },
    3,
  ],
}
// -> 6
```

Which would be represented diagramatically with the following expression tree:

![Example 2](/docs/img/Example_1.png)

A playground for building and testing expressions is available [here](LINK)

## Install

`npm install fig-tree`\
or\
`yarn add fig-tree`

## Usage

```js
import FigTreeEvaluator from 'fig-tree-evaluator'

// New evaluator instance
const exp = new FigTreeEvaluator([ options ]) // See available options below

// Evaluate expressions
exp.evaluate(expression, [options]) // Options over-ride initial options for this evaluation
    .then((result) => { // "evaluate" is async method
        // Do something with result
    })

// Or within async function:
const result = await exp.evaluate(expression, [options])
```

## Available options

The `options` parameter is an object with the following available properties (all optional):

- `objects` -- a single object containing any *objects* in your application that may wish to be inspected using the [objectProperties](#object_properties) operator. (See [playground](LINK) for examples). If these objects are regularly changing, you'll probably want to pass them into each separate evaluation rather than with the initial constructor.
- `functions` -- a single object containing any *custom functions* available for use by the [customFunctions](#custom_functions) operator.
- `pgConnection` -- if you wish to make calls to a Postgres database using the [`pgSQL` operator](#pg_sql), pass a [node-postres](https://node-postgres.com/) connection object here.
- `graphQLConnection` -- a GraphQL connection object, if using the [`graphQL` operator](#graphql). See operator details below.
- `baseEndpoint` -- A general http headers object that will be passed to *all* http-based operators (`GET`, `POST`, `GraphQL`). Useful if all http queries are to a common server -- then each individual node will only require a relative url. See specific operator for more details.
- `headers` -- A general http headers object that will be passed to *all* http-based operators. Useful for authenticatian headers, for example. Each operator and instance can have its own headers, though, so see specific operator reference for details.
- `returnErrorAsString` -- by default the evaluator will throw errors with invalid evaluation expressions (with helpful error messages indicating the node which threw the error and what the problem was). But if you have `returnErrorAsString: true` set, the evaluator will never throw, but instead return error messages as a valid string output. (See also the [`fallback`](#other-common-properties) parameter below)
- `allowJSONStringInput` -- the evaluator is expecting the input expression to be a javascript object. However, it will also accept JSON strings if this option is set to `true`. We have to perform additional logic on every evaluation input to determine if a string is a JSON expression or a standard string, so this is skipped by default for performance reasons. However, if you want to send (for example) user input directly to the evaluator without running it through your own `JSON.parse()`, then enable this option.
- `skipRuntimeTypeCheck` -- we perform comprehensive type checking at runtime to ensure that each operator only performs its operation on valid inputs. If type checking fails, we throw an error detailing the explicit problem. However, if `skipRuntimeTypeCheck` is set to `true`, then all inputs are passed to the operator regardless, and any errors will come from whatever standard javascript errors might be encoutered (e.g. trying to pass a primitive value when an array is expected => `.map is not a function`)

As mentioned above, `options` can be provided as part of the constructor as part of each seperate evaluation. You can also change the options permanently for a given evaluator instance with:

`exp.updateOptions(options)`

You can also retrieve the current options state at any time with:

`exp.getOptions()`

It's also possible to run one-off evaluations by importing the evaluation method directly rather than using the constructor:

```js
import { evaluateExpression } from 'fig-tree-evaluator'

evaluateExpression(expression, [options]).then((result) => {
    // Do something with result
}
```

## Operator nodes

Each operator has a selections of input properties associated with it, some required, some optional. For example, the `conditional` operator requires inputs equivalent to the javascript ternary operator, and are expressed as follows:

```js
{
    operator: "conditional", // or "?"
    condition: <boolean>, // or fig-tree expression that returns boolean
    valueIfTrue: <someValue>,
    valueIfFalse: <someOtherValue>

}
```

However, it is also possible to provide the operator properties (or "operands") as a single `children` array, in which case the specific properties are interpreted positionally.

For example, the following two representations are equivalent `conditional` operator nodes:

```js
{
    operator: "?", // conditional (alias)
    condition: 1 + 1 ==== 2
    valueIfTrue: "True output",
    valueIfFalse: "False output"
}

// same as:

{
    operator: "?",
    children: [ 1 + 2 === 2, "True output", "False output" ]
}
```

Most of the time named properties is preferable; however there are situations where the "children" array might be easier to deal with, or to generate from child nodes.

### Other common properties:

In each operator node, as well as the operator-specific properties, the following two optional properties can be provided:

- `fallback`: if the operation throws an error, the `fallback` value will be returned instead. The `fallback` property can be provided at any level of the expression tree and bubbled up from where errors are caught to parent nodes.
- `outputType` (or `type`): will convert the result of the current node to the specified `outputType`. Valid values are `string`, `number`, `boolean` (or `bool`), and `array`. You can experiment in the [demo app](LINK) to see the outcome of applying different `outputType` values to various results.

Remember that *all* operator node properties can themselves be operator nodes, *including* the `fallback` and `outputType` properties.

e.g.

```js
// Dynamic outputType, which uses the fallback value due to missing property
// for the conditional '?' operator:
{
  operator: '+',
  values: [9, 10, 11],
  outputType: {
    operator: '?',
    condition: {
      operator: '=',
      values: ['three', 'four'],
    },
    valueIfTrue: 'number',
    fallback: 'string',
  },
}
// => "30"

```

### Operator & Property Aliases

For maximal flexibility, all operator names are case-insensitive, and also come with a selection of "aliases" that can be used instead, based on context or preference (e.g. the `conditional` operator can also be aliased as `?` or `ifThen`). See specific operator reference for all available aliases.

Similarly, some property names accept aliases -- see individual operators for these.

## Operator reference

The full list of available operators and their associated properties:

<sup>*</sup> denotes "required" properties

### AND

*Logical AND*

Aliases: `and`, `&`, `&&`

#### Properties

- `values`<sup>*</sup>: (array) -- any number of elements; will be compared using Javascript `&&` operator

e.g.
```js
{
  operator: '&',
  values: [true, true, true],
}
// => true
```

`children` array: `[...values]`

----
### OR

*Logical OR*

Aliases: `or`, `|`, `||`

#### Properties

- `values`<sup>*</sup>: (array) -- any number of elements; will be compared using Javascript `||` operator

e.g.
```js
{
  operator: 'or',
  values: [
    true,
    {
      operator: 'and',
      values: [true, false],
    },
    true,
  ],
}
// => true
```

`children` array: `[...values]`

----
### EQUAL

*Equality*

Aliases: `=`, `eq`, `equal`, `equals`

#### Properties

- `values`<sup>*</sup>: (array) -- any number of elements; will be compared using Javascript `==` operator

e.g.
```js
{
  operator: '=',
  values: [3, 3, 'three'],
}
// => false
```

`children` array: `[...values]`

----
### NOT_EQUAL

*Non-equality*

Aliases: `!=`, `!`, `ne`, `notEqual`

#### Properties

- `values`<sup>*</sup>: (array) -- any number of elements; will be compared using Javascript `!=` operator

e.g.
```js
{
  operator: '=',
  values: [3, 3, 'three'],
}
// => true
```

`children` array: `[...values]`

----
### PLUS

*Addition, concatenation, merging*

Aliases: `+`, `add`, `concat`, `join`, `merge`

#### Properties

- `values`<sup>*</sup>: (array) -- any number of elements. Will be added (numbers), concatenated (strings, arrays) or merged (objects) according their type.
- `type`: (`'string' | 'array'`) -- if specified, operator will treat the `values` as though they were this type. E.g. if `string`, it will concatenate the values, even if they're all numbers. The difference between this property and the common [`outputType` property](#other-common-properties) is that `outputType` converts the result, whereas this `type` property converts each element *before* the "PLUS" operation. 

e.g.
```js
{
  operator: '+',
  values: [4, 5, 6],
}
// => 15

{
  operator: '+',
  values: ['this', ' and ', 'that'],
}
// => 'this and that'

{
  operator: '+',
  values: [{one: 1, two: 2}, {three: 3}],
}
// => {one: 1, two: 2, three: 3}

{
  operator: '+',
  values: [4, 5, 6],
  type: 'string'
}
// => "456"

{
  operator: '+',
  values: [4, 5, 6],
  type: 'array'
}
// => [4, 5, 6]

```

`children` array: `[...values]`

----
### SUBTRACT

*Subtraction*

Aliases: `-`, `subtract`, `minus`, `takeaway`

#### Properties

- `values`<sup>*</sup>: (array) -- exactly 2 numerical elements; the second will be subtracted from the first. (If non-numerical elements are provided, the operator will return `NaN`)

e.g.
```js
{
  operator: '-',
  values: [10, 8],
}
// => 2

{
  operator: 'minus',
  values: [0, 3.5, 10], // additional elements after the first two ignored
}
// => -3.5

{
  operator: '-',
  values: [4, "three"],
}
// => NaN
```

`children` array: `[originalValue, valueToSubtract]` (same as `values`)

----
### MULTIPLY

*Multiplcation*

Aliases: `*`, `x`, `multiply`, `times`

#### Properties

- `values`<sup>*</sup>: (array) -- any number of numerical elements. Returns the product of all elements.  (If non-numerical elements are provided, the operator will return `NaN`)

e.g.
```js
{
  operator: '*',
  values: [5, 7],
}
// => 35

{
  operator: 'x',
  values: [2, 3.5, 10], // additional elements after the first two ignored
}
// => 70

{
  operator: 'times',
  values: [4, "three"],
}
// => NaN
```

`children` array: `[...values]`

----
### DIVIDE

*Division*

Aliases: `/`, `divide`, `÷`

#### Properties

- `values`: (array) -- exactly 2 numerical elements; the first will be divided by the second.  (If non-numerical elements are provided, the operator will return `NaN`)
- `dividend` (or `divide`): (number) -- the number that will be divided
- `divisor` (or `by`): (number) -- the number to divide `dividend` by
- `output` (`'quotient' | 'remainder'`) -- by default, the operator returns a floating point value. However, if `quotient` is specified, it will return the integer part of the result; if `remainder` is specified, it will return the remainder after division (i.e. `value1 % value2`)

Note that the input values can be provided as *either* a `values` array *or* `dividend`/`divisor` properties. If both are provided, `values` takes precedence.

e.g.
```js
{
  operator: '/',
  values: [35, 7],
}
// => 5

{
  operator: '/',
  divide: 20,
  by: 3,
  output: 'quotient' 
}
// => 6

{
  operator: 'divide',
  dividend: 20,
  divisor: 3,
  output: 'remainder'
}
// => 2
```

`children` array: `[dividend, divisor]` (same as `values`)

----
### GREATER_THAN

*Greater than (or equal to)*

Aliases: `>`, `greaterThan`, `higher`, `larger`

#### Properties

- `values`<sup>*</sup>: (array) -- exactly 2 values. Can be any type of value that can be compared with Javascript `>` operator.
- `strict`: (boolean, default `false`) -- if `true`, value 1 must be strictly greater than value 2 (i.e. `>`). Otherwise it will be compared with "greater than or equal to" (i.e. `>=`)

e.g.
```js
{
  operator: '>',
  values: [10, 8]
}
// => true

{
  operator: '>',
  values: ["alpha", "beta"]
}
// => false

{
  operator: '>',
  values: [4, 4],
  strict: true
}
// => false
```

`children` array: `[firstValue, secondValue]` (same as `values`)

----
### LESS_THAN

*Less than (or equal to)*

Aliases: `<`, `lessThan`, `lower`, `smaller`

#### Properties

- `values`<sup>*</sup>: (array) -- exactly 2 values. Can be any type of value that can be compared with Javascript `<` operator.
- `strict`: (boolean, default `false`) -- if `true`, value 1 must be strictly lower than value 2 (i.e. `<`). Otherwise it will be compared with "less than or equal to" (i.e. `<=`)

e.g.
```js
{
  operator: '<',
  values: [10, 8]
}
// => false

{
  operator: '<',
  values: ["alpha", "beta"]
}
// => true

{
  operator: '<',
  values: [4, 4],
  strict: false
}
// => true
```

`children` array: `[firstValue, secondValue]` (same as `values`)

----
### COUNT

*Count elements in array*

Aliases: `count`, `length`

#### Properties

- `values`<sup>*</sup>: (array) -- any number of elements. Returns `array.length`

e.g.
```js
{
  operator: 'count',
  values: [10, 8, "three", "four"]
}
// => 4
```

`children` array: `[...values]`

----
### CONDITIONAL

*Return different values depending on a condition expression*

Aliases: `?`, `conditional`, `ifThen`

#### Properties

- `condition`<sup>*</sup>: (boolean) -- a boolean value (presumably the result of a child expression)
- `valueIfTrue` (or `ifTrue`)<sup>*</sup>: the value returned if `condition` is `true`
- `valueIfFalse` (or `ifFalse`)<sup>*</sup>: the value returned if `condition` is `false`

e.g.
```js
{
  operator: '?',
  condition: {
    operator: '=',
    values: [
      {
        operator: '+',
        values: [5, 5, 10],
      },
      20,
    ],
  },
  ifTrue: 'YES',
  ifFalse: 'NO',
}
// => YES
```

`children` array: `[condition, valueIfTrue, valueIfFalse]`

----
### REGEX

*Compares an input string against a [regular expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) pattern*

Aliases: `regex`, `patternMatch`, `regexp`, `matchPattern`

#### Properties

- `testString` (or `string`, `value`)<sup>*</sup>: (string) -- the string to be compared against the regex pattern
- `pattern` (or `regex`, `regexp`, `regExp`, `re`)<sup>*</sup>: (string) a regex pattern to test `testString` against

Returns `true` (match found) or `false` (no match)

e.g.
```js
{
  operator: 'regex',
  string: "home@myplace.com",
  pattern: '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$'  // Simple Email validation
}
// => true
```

`children` array: `[testString, pattern]`

----
### OBJECT_PROPERTIES

*Extracts values from objects in your application*

Aliases: `objectProperties`, `objProps`, `getProperty`, `getObjProp`

#### Properties

- `property` (or `path`, `propertyName`)<sup>*</sup>: (string) -- the path to the required property in the object
- `additionalObjects` (or `objects`, `additional`): (object) -- any other objects whose properties can be referenced in `property` (see below)

Objects are normamlly expected to be passed in to the evaluator as part of the [options](#available-options), not as part of the expression itself. The reason for this is that the source objects are expected to be values internal to your application, whereas the evaluator provides an externally configurable mechanism to extract (and process) application data. (However, it is possible to pass objects directly as part of the expression using the `additionalObjects` property, so (in theory) objects could be dynamically generated from other expressions.)

For example, consider a `user` object and an fig-tree evaluator instance: 

```js
const user = {
  firstName: 'Peter',
  lastName: 'Parker',
  alias: 'Spider-man',
  friends: ['Ned', 'MJ', 'Peter 2', 'Peter 3'],
  enemies: [
    { name: 'The Vulture', identity: 'Adrian Toomes' },
    { name: 'Green Goblin', identity: 'Norman Osborne' },
  ],
}

const exp = new FigTreeEvaluator()

const expression = getExpressionFromConfig()

exp.evaluate(expression, { objects: { user } })
```

Here is the result of various values of `expression:`

```js
{
  operator: 'objectProperties',
  property: 'user.firstName',
}
// => "Peter"

{
  operator: 'getProperty',
  path: 'user.friends[1]',
}
// => "MJ"

{
  operator: 'getProperty',
  path: 'user.enemies.name',
}
// => ["The Vulture", "Green Goblin"]
```
Notice the last example pulls multiple values out of an array of objects, in this case the "name". This is essentially a shorthand for:

```js
const result = { operator: 'getProperty', path: 'user.enemies' }
result.map((e) => e.name)
```

The "objectProperties" operator uses [`object-property-extractor`](https://www.npmjs.com/package/object-property-extractor) internally, so please see the documentation of that package for more information.

The "objectProperties" operator will throw an error if an invalid path is provided, so it is recommended to provide a `fallback` value for the expression:
```js
{
  operator: 'objectProperties',
  property: 'user.middleName',
  fallback: 'Not found!'
}
// => "Not found!"
```

`children` array: `[property]`


Example using "objects" passed in dynamically as part of expression:

```js
{
  operator: 'objectProperties',
  property: 'user.name',
  additionalObjects: {
    operator: '?',
    condition: { operator: '=', values: [{ operator: '+', values: [7, 8, 9] }, 25] },
    valueIfTrue: { user: { name: 'Bilbo' } },
    valueIfFalse: { user: { name: 'Frodo' } },
  },
}
// => "Frodo"
```

----
### STRING_SUBSTITUTION

*Replace values in a string using simple parameter substitution*

Aliases: `stringSubstitution`, `substitute`, `stringSub`, `replace`

#### Properties

- `string`<sup>*</sup>: (string) -- a parameterized (`%1`, `%2`) string, where the parameters are to be replaced by dynamic values. E.g. `"My name is %1 (age %2)"`
- `substitutions` (or `replacments`)<sup>*</sup>: (array) -- the values to be substituted into `string`

The values in the `substitutions` array are replaced in the original `string` by matching their order to the numerical order of the parameters.

e.g.
```js
{
  operator: 'stringSubstitution',
  string: 'My name is %1 (age %2)',
  substitutions: [
    'Steve Rogers',
    {
      operator: '-',
      values: [2023, 1918],
    },
  ],
}
// => "My name is Steve Rogers (age 106)"

{
  operator: 'replace',
  string: '%1 is actually %2 %3',
  substitutions: [
    // Using the 'user' object from above
    {
      operator: 'objectProperties',
      property: 'user.alias',
    },
    {
      operator: 'objectProperties',
      property: 'user.firstName',
    },
    {
      operator: 'objectProperties',
      property: 'user.lastName',
    },
  ],
}
// => "Spiderman is actually Peter Parker"

// Parameters can be repeated:
{
  operator: 'stringSubstitution',
  string: 'A %1 says: "%2 %2 %2"',
  substitutions: ['bird', 'Tweet!'],
}
// => 'A bird says: "Tweet! Tweet! Tweet!"'
```

`children` array: `[string, ...substitutions]`

e.g.
```js
{
  operator: 'replace',
  children: ['I am %1 %2', 'Iron', 'Man'],
}
// => "I am Iron Man"
```

----

### SPLIT

*Split strings into arrays*

Aliases: `split`, `arraySplit`

#### Properties

- `value` (or `string`)<sup>*</sup>: (string) -- string to be split
- `delimiter` (or `separator`): (string) -- substring to split `value` on (Default: `" "` (space)) 
- `trimWhiteSpace` (or `trimWhitespace`, `trim`): (boolean, default `true`) -- strips whitespace from the beginning or end of resulting substrings 
- `excludeTrailing` (or `removeTrailing`, `excludeTrailingDelimiter`): (boolean, default `true`) -- if `false`, if the input string ends with the delimiter, the last member of the output array will be an empty string.  
  i.e. `this, that, another,` (delimiter `","`) => `["this", "that", "another", ""]`

The last two parameters (`timeWhiteSpace` and `excludeTrailing`) should rarely be needed.

e.g.
```js
{
  operator: 'split',
  children: ['Alpha, Beta, Gamma, Delta', ','],
}
// => ['Alpha', 'Beta', 'Gamma', 'Delta']

```

`children` array: `[value, delimiter]`  
(`trimWhiteSpace` and `excludeTrailing` not available, since array can only support one optional parameter)

- `urlObject`: either a url string, or an object structured as `{url: <string>, headers: <object>}` (if additional headers are required)
- `parameterKeys`: an array of strings representing the keys of any query parameters
- `...values`: one value for each key specified in `parameterKeys`
- `returnProperty` (optional): as above

---
### GET

*Http GET request*

Aliases: `get`, `api`

#### Properties

- `url` (or `endpoint`)<sup>*</sup>: (string) -- url to be queried
- `parameters`: (object) -- key-value pairs for any query parameters for the request
- `headers`: (object) -- any additional headers (such as authentication) required for the request
- `returnProperty` (or `outputProperty`): (string) -- an object path for which property to extract from the returned data. E.g. if the API returns `{name: {first: "Bruce", last: "Banner"}, age: 35}` and you specify `returnProperty: "name.first`, the operator will return `"Bruce"` (Uses the same logic as the [objectProperties](#object_properties) internally)

As mentioned in the [options reference](#available-options) above, a `baseEndpoint` string and `headers` object can be provided in the constructor. These are applied to all subsequent requests to save having to specify them in every evaluation. (Additional/override `headers` can always be added to a specific evaluation, too.)

e.g.
```js
{
  operator: 'GET',
  url: 'https://restcountries.com/v3.1/name/zealand',
  returnProperty: 'name.common',
  outputType: 'string' // This extracts the string from the returned array value
}
// => "New Zealand"

{
  operator: 'get',
  endpoint: {
    operator: '+',
    values: ['https://restcountries.com/v3.1/name/', 'india'],
  },
  parameters: { fullText: true },
  outputProperty: '[0].name.nativeName.hin',
}
// => { "official": "भारत गणराज्य", "common": "भारत" }

```

`children` array: `[urlObject, parameterKeys, ...values, returnProperty]`

- `urlObject`: either a url string, or an object structured as `{url: <string>, headers: <object>}` (if additional headers are required)
- `parameterKeys`: an array of strings representing the keys of any query parameters
- `...values`: one value for each key specified in `parameterKeys`
- `returnProperty` (optional): as above

e.g.
```js
{
  operator: 'get',
  children: [
    'https://restcountries.com/v3.1/name/cuba', // url
    ['fullText', 'fields'], // parameterKeys
    'true', // parameter value 1
    'name,capital,flag', // parameter value 2
    'flag', // returnProperty
  ],
  outputType: 'string',
}
// => "🇨🇺"
```

----
### POST

*Http POST request*

Aliases: `post`

The "POST" operator is basically structurally the same as [GET](#get).

#### Properties

- `url`/`endpoint`<sup>*</sup>,`parameters`, `headers`, `returnProperty`/`outputProperty` -- same as "GET" operator (although the `parameters` object will be passed to the Post request as body JSON rather than url query parameters)

e.g.
```js
{
  operator: "post",
  endpoint: "https://jsonplaceholder.typicode.com/posts",
  parameters: {
    title: "New Blog Post",
    body: "Just a short note...",
    userId: 2
  },
  returnProperty: "id"
}
// => 101

```

`children` array: `[urlObject, parameterKeys, ...values, returnProperty]` (same as "GET")

----

### GRAPHQL

*Http GraphQL request (using POST)*

Aliases: `graphQl`, `graphql`, `gql`

This operator is essentially a special case of the "POST" operator, but structured specifically for [GraphQL](https://graphql.org/) requests.

#### Properties

- `query`<sup>*</sup>: (string) -- the GraphQL query string
- `variables`: (object) -- key-value pairs for any variables used in the `query`
- `url` (or `endpoint`): (string) -- url to be queried (Only required if querying a different url to that specified in the GraphQLConnection object in fig-tree `options`)
- `headers`: (object) -- any additional headers (such as authentication) required for the request
- `returnNode` (or `returnProperty`, `outputProperty`): (string) -- an object path for which property to extract from the returned data (same as "GET" and "POST").

As mentioned in the [options reference](#available-options) above, a `headers` object can be provided in the constructor. These are applied to all subsequent requests to save having to specify them in every evaluation, although additional/override `headers` can always be added to a specific evaluation, too.

Often, GraphQL queries will be to a single endpoint and only the query/variables will differ. In that case, it is recommended to pass a GraphQL connection object into the FigTreeEvaluator constructor [options](#available-options).

The required connection object is:
```ts
{
  endpoint: string // url
  headers?: { [key: string]: string } // key-value pairs
}
```

The following example expression uses the GraphQL connection: `{endpoint: 'https://countries.trevorblades.com/'}`
```js
{
  operator: 'graphQL',
  query: `query getCountry($code: String!) {
      countries(filter: {code: {eq: $code}}) {
        name
        emoji
      }
    }`,
  variables: { code: 'NZ' },
  returnNode: 'countries[0]',
}
// => { "name": "New Zealand", "emoji": "🇳🇿" }

```

`children` array: `[query, endpoint, variableKeys, ...variableValues, returnNode]`

- `query`: the GraphQL query (string)
- `endpoint`: url string; to use the endpoint provided in the GraphQL connection options, pass empty string `""` here
- `variableKeys`: an array of strings representing the keys the GraphQL `variables` object
- `...variableValues`: one value for each key specified in `variableKeys`
- `returnNode` (optional): the return property, as per "GET" and "POST" operators

e.g.
```js
{
  operator: 'GraphQL',
  children: [
    `query getCountry($code: String!) {
      countries(filter: {code: {eq: $code}}) {
        name
        emoji
      }
    }`,
    "", // default endpoint
    ['code'], // variable keys
    'NZ', // variable value
    'countries.emoji', // return node
  ],
  type: 'string',
}
// => "🇨🇺"
```

----
### PG_SQL

*Query a Postgres database using [`node-postgres`](https://node-postgres.com/)*

Aliases: `pgSql`, `sql`, `postgres`, `pg`, `pgDb`

#### Properties

- `query`<sup>*</sup>: (string) -- SQL query string, with parameterised replacements (i.e. `$1`, `$2`, etc)
- `values` (or `replacements`): (array) -- replacements for the `query` parameters
- `type`: (`"array" | "string" | "number"`) -- determines the shape of the resulting data. To quote `node-postgres`:  
  > By default node-postgres reads rows and collects them into JavaScript objects with the keys matching the column names and the values matching the corresponding row value for each column. If you do not need or do not want this behavior you can pass rowMode: 'array' to a query object. This will inform the result parser to bypass collecting rows into a JavaScript object, and instead will return each row as an array of values.  

  We extend this a step further by flattening the array, and (if `"string"` or `"number"`) converting the result to a concatenated string or (if possible) number.

In order to query a postgres database, fig-tree must be provided with a database connection object -- specifically, a [`node-postgres`](https://node-postgres.com/) `Client` object:

```js
import { Client } from 'pg'
const pgConnect = new Client(pgConfig) // pgConfig = database details, see node-postgres documentation

pgConnect.connect()

const exp = new FigTreeEvaluator({ pgConnection: pgConnect })
```

The following examples query a default installation of the [Northwind](https://github.com/pthom/northwind_psql) demo database.

e.g.
```js
{
  operator: 'pgSql',
  query: "SELECT contact_name FROM customers where customer_id = 'FAMIA';",
  type: 'string',
}
// => "Aria Cruz"

{
  operator: 'pgSQL',
  query: 'SELECT product_name FROM public.products WHERE category_id = $1 AND supplier_id != $2',
  values: [1, 16],
  type: 'array',
}
// => ["Chai","Chang","Guaraná Fantástica","Côte de Blaye","Chartreuse verte",
//     "Ipoh Coffee","Outback Lager","Rhönbräu Klosterbier","Lakkalikööri"]

```

`children` array: `[queryString, ...substitutions]`

(`type` is provided by the common `type`/`outputType` property)


----
### BUILD_OBJECT

*Return an object constructed by separate keys and values*

Aliases: `buildObject`, `build`, `object`

The "buildObject" operator would primarily be used to construct an object input for another operator property (e.g. `variables` on "GraphQL") out of elements that are themselves evaluator expressions.

#### Properties

- `properties` (or `values`, `keyValPairs`, `keyValuePairs`)<sup>*</sup>: (array) -- array of objects of the following shape:  
  ```ts
  {
    key: string
    value: any
  }
  ```
  Each element provides one key-value pair in the output object

e.g.
```js
{
  operator: 'buildObject',
  properties: [
    { key: 'one', value: 1 },
    { key: 'two', value: 2 },
    {
      // Using "user" object from earlier
      key: { operator: 'objectProperties', property: 'user.friends[0]' },
      value: {
        operator: '+',
        values: [7, 8, 9],
      },
    },
  ],
}
// => { one: 1, two: 2, Ned: 24 }

```

`children` array: `[key1, value1, key2, value2, ...]`

This is one of the few operators where the `children` array might actually be simpler to define than the `properties` property, depending on how deep the array elements are themselves operator nodes.

e.g.
```js
// This is the same as the previous expression
{
  operator: 'buildObject',
  children: ['one', 1, 'two', 2,
    { operator: 'objectProperties', property: 'user.friends[0]' },
    { operator: '+', values: [7, 8, 9] },
  ],
}
// => { one: 1, two: 2, Ned: 24 }
```

----
### PASSTHRU

*Pass-thru (does nothing)*

Aliases: `passThru`, `_`, `pass`, `ignore`, `coerce`, `convert`

This operator simply returns its input. Its purpose is to allow an additional type conversion (using `outputType`) before passing up to a parent node.

#### Properties

- `value` (or `_`, `data`)<sup>*</sup>: (any) -- the value that is returned

e.g.
```js
{
  operator: 'pass',
  value: { operator: '+', values: [50, 0], type: 'string' },
  outputType: 'array',
}
// => ["500"]
```

----

### CUSTOM_FUNCTIONS

*Extend functionality by calling custom functions*

Aliases: `customFunctions`, `customFunction`, `objectFunctions`, `functions`, `function`, `runFunction`

#### Properties

- `functionPath` (or `functionsPath`, `functionName`, `funcPath`<sup>*</sup>: (string) -- path to where the function resides in the `options.functions` object
- `args` (or `arguments`, `variables`): (array) -- input arguments for the function

Custom functions are stored in the evaluator `options`, in the `functions` property.

For examples, consider the following fig-tree instance:
```js
const exp = new FigTreeEvaluator({
  functions: {
    double: (x) => x * 2,
    getCurrentYear: () => new Date().toLocaleString('en', { year: 'numeric' }),
    toUpperCase: (input) => input.toUpperCase(),
  },
})
```

Here is the result of various expressions:
```js
{
  operator: 'functions',
  functionPath: 'double',
  args: [50],
}
// => 100

{
  operator: '+',
  values: [
    {
      operator: 'customFunctions',
      functionPath: 'toUpperCase',
      args: ['The current year is: '],
    },
    {
      operator: 'customFunctions',
      functionPath: 'getCurrentYear',
    },
  ],
}
// => "THE CURRENT YEAR IS: 2022"
```

`children` array: `[functionPath, ...args]`

e.g.
```js
{
  operator: 'functions',
  children: ['double', 99],
}
// => 198
```

## More examples

More examples, included large, complex expressions can be found within the test suites in the [repository](https://github.com/CarlosNZ/fig-tree-evaluator).

## Development environment

Github repo: https://github.com/CarlosNZ/fig-tree-evaluator

After cloning:

`yarn setup` -- installs required dependencies for both the main module and the demo app (runs `yarn install` within each)

`yarn demo` -- launch a local version of the demo playground in your browser for building and testing expressions

## Tests

There is a comprehensive [Jest](https://jestjs.io/) test suite for all aspects of fig-tree. To run all tests:

`yarn test`

In order for the http-based tests to run, you'll need to be connected to the internet. For the Postgres tests, you'll need to have a postgres database running locally, with the [Northwind](https://github.com/pthom/northwind_psql) database installed.

Individual tests can be run by string matching the argument to the test filenames. E.g. `yarn test string` will run the test from `9_stringSubstitution.test.ts`.

## Help, Feedback, Suggestions

Please open an issue: https://github.com/CarlosNZ/fig-tree-evaluator/issues