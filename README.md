# expression-evaluator

%NAME% is a module to evaluate JSON-structured expressions. 

A typical use case would be for configuration files, where you need to store dynamic values or logic in a "templating" language without exposing executable code to users. For example, a form-builder app (example) might need to allow a user to specify logic for form element visibility based on previous responses, or for validation logic beyond what is available in standard validation libraries.

<!-- toc -->

## The basics

%NAME% evaluates expressions structured in a JSON [expression tree](LINK). A single "node" of the tree consists of an **Operator**, with associated parameters (or child nodes), each of which can itself be another Operator node -- i.e. a recursive tree structure of arbitrary depth and complexity.

A wide range of [operators are available](LINK), but [custom fuctions](LINK) can be added in your implementation if you wish to extend the available functionality.

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

## Implementation

### Install

`npm install %NAME%`\
or\
`yarn add %NAME%`

### Usage

```js
import Evaluator from '%NAME%'

// New evaluator instance
const exp = new Evaluator([ options ]) // See available options below

// Evaluate expressions
exp.evaluate(expression, [options]) // Options over-ride initial options for this evaluation
    .then((result) => { // "evaluate" is async method
        // Do something with result
    })

// Or within async function:
const result = await exp.evaluate(expression, [options])
```

### Available options

- `objects` -- a single object containing any *objects* in your application that may wish to be inspected using the [objectProperties](LINK) operator. (See [playground](LINK) for examples). If these objects are regularly changing, you'll probably want to pass them into each separate evaluation rather than with the initial constructor.
- `functions` -- a single object containing any *custom functions* available for use by the [customFunctions](LINK) operator.
- `pgConnection` -- if you wish to make calls to a Postgres database using the `pgSQL` operator, pass a [node-postres](LINK) connection object here.
- `graphQLConnection` -- a GraphQL connection object, if using the [`graphQL` operator](link). See operator details below.
- `baseEndpoint` -- A general http headers object that will be passed to *all* http-based operators (`GET`, `POST`, `GraphQL`). Useful if all http queries are to a common server -- then each individual node will only require a relative url. See specific operator for more details.
- `headers` -- A general http headers object that will be passed to *all* http-based operators. Useful for authenticatian headers, for example. Each operator and instance can have its own headers, though, so see specific operator reference for details.
- `returnErrorAsString` -- by default the evaluator will throw errors with invalid evaluation expressions (with helpful error messages indicating the node which threw the error and what the problem was). But if you have `returnErrorAsString: true` set, the evaluator will never throw, but instead return error messages as a valid string output. (See also the [`fallback`](LINK) parameter below)
- `allowJSONStringInput` -- the evaluator is expecting the input expression to be a javascript object. However, it will also accept JSON strings if this option is set to `true`. We have to perform additional logic on every evaluation input to determine if a string is a JSON expression or a standard string, so this is skipped by default for performance reasons. However, if you want to send (for example) user input directly to the evaluator without running it through your own `JSON.parse()`, then enable this option.
- `skipRuntimeTypeCheck` -- we perform comprehensive type checking at runtime to ensure that each operator only performs its operation on valid inputs. If type checking fails, we throw an error detailing the explicit problem. However, if `skipRuntimeTypeCheck` is set to `true`, then all inputs are passed to the operator regardless, and any errors will come from whatever standard javascript errors might be encoutered (e.g. trying to pass a primitive value when an array is expected => `.map is not a function`)

As mentioned above, `options` can be provided as part of the constructor as part of each seperate evaluation. You can also change the options permanently for a given evaluator object with:

`exp.updateOptions(options)`

You can also retrieve the current options state at any time with:

`exp.getOptions()`


## Operator nodes

Each operator has a selections of input properties associated with it, some required, some optional. For example, the `conditional` operator requires inputs equivalent to the javascript ternary operator, and are expressed as follows:

```js
{
    operator: "conditional", // or "?"
    condition: <boolean>, // or evaluator expression that returns boolean
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

Most of the time named properties is preferable; however there are situations where the "children" array might be easier to deal with.

### Other common properties:

In each operator node, as well as the operator-specific properties, the following two optional properties can be provided:

- `fallback`: if the operation results in an error, the `fallback` value will be returned instead. The `fallback` property can be provided at any level of the expression tree and bubbled up from where errors are caught to parent nodes.
- `outputType` (or `type`): will convert the result of the given node to the specified `outputType`. Valid values are `string`, `number`, `boolean` (or `bool`), and 'array'. You can experiment in the demo app to see the outcome of applying different `outputType` values to various results.

Remember that *all* operator node properties can themselves be operator nodes, *including* the `fallback` and `outputType` properties. E.g.

```js
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
    fallback: 'string', // fallback used due missing property "valueIfFalse"
  },
}
// => "30"

```

### Operator Aliases

For maximal flexibility, all operator names are case-insensitive, and also come with a selection of "aliases" that can be used instead, based on context or preference (e.g. the `conditional` operator can also be aliased as `?` or `ifThen`). See specific operator reference for full list of aliases.

### Operator reference

<sup>*</sup> denotes "required" properties

The full list of available operators and their associated properties is as follows:

#### AND

*Logical AND*

Aliases: `and`, `&`, `&&`

##### Properties

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

#### OR

*Logical OR*

Aliases: `or`, `|`, `||`

##### Properties

- `values`<sup>*</sup>: (array) -- any number of elements; will be compared using Javascript `||` operator

e.g.
```js
{
  operator: '&',
  values: [true, { operator: 'and', values: [true, false] }, true],
}
// => true
```

`children` array: `[...values]`

#### EQUAL

*Equality*

Aliases: `=`, `eq`, `equal`, `equals`

##### Properties

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

#### NOT_EQUAL

*Non-equality*

Aliases: `!=`, `!`, `ne`, `notEqual`

##### Properties

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

#### PLUS

*Addition, concatenation, merge*

Aliases: `+`, `add`, `concat`, `join`, `merge`

##### Properties

- `values`<sup>*</sup>: (array) -- any number of elements. Will be added (numbers), concatenated (strings, arrays) or merged (objects) according their type.
- `type`: (`'string' | 'array'`) -- tell

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

```

`children` array: `[...values]`

Documentation pending.

See [here](https://github.com/openmsupply/conforma-server/wiki/Query-Syntax) for V1 documentation.

### Development

`yarn setup` -- installs required dependencies for both the main module and the demo app

Run `yarn demo` to load a browser-based explorer for trying out queries. (You'll need to run `yarn install` within the "demo" folder first)

<!-- Tests -->