# fig-tree-evaluator

<img src="images/FigTreeEvaluator_logo_1000.png" alt="Logo" width="300" align="left">

<img src="images/spacer.svg" width="10" height="148" align="left" alt="">

**Dynamic logic for your config, written as plain JSON.**

FigTree evaluates expressions written as JSON. It lets you put real logic in places that can only hold data, like a config file, a database row or a form definition, without ever running code that came from outside your app.

<br clear="left">

> **Upgrading from v2?** v3 is a significant redesign, and there's a converter for your existing expressions. See [Migrating from v2](https://DOCS_URL/migrating/). The v2 docs are on the [`v2.x` branch](https://github.com/CarlosNZ/fig-tree-evaluator/tree/v2.x).

## Your config is already an expression

Say your app builds forms from JSON definitions, and one of the fields looks like this:

```json
{
  "label": "Driver licence number",
  "type": "text",
  "visible": true
}
```

That's fine until someone asks for the field to show only for licensed drivers aged 16 or over, and for some help text that names the user's country. Normally that's the point where the logic moves out of the config and into your code, as yet another special case. With FigTree, it stays where it belongs:

```json
{
  "label": "Driver licence number",
  "type": "text",
  "visible": { "$and": [{ "$>=": ["$data.age", 16] }, "$data.hasLicence"] },
  "helpText": { "$buildString": "Required for drivers in {{$data.country}}" }
}
```

Give that to FigTree along with the current user's data:

```js
const field = await fig.evaluate(fieldDefinition, {
  data: { age: 34, hasLicence: true, country: 'New Zealand' },
})
```

and you get plain config back, ready to use:

```json
{
  "label": "Driver licence number",
  "type": "text",
  "visible": true,
  "helpText": "Required for drivers in New Zealand"
}
```

There are only two rules to learn to read that:

- a **key** starting with `$` runs an operator (`$and`, `$>=`, `$buildString`)
- a **string** starting with `$` reads a value (`"$data.age"`)

Everything else is left exactly as it is.

And it's still just JSON. You can store it in a database, send it over the network, or let an admin edit it in a UI, and nothing in it can execute code. An expression can only do what the operators you've registered allow, so it can't even make an HTTP request or query a database unless you've given FigTree a client to do it with.

A few ways it's being used:

- In the [Conforma](https://github.com/openmsupply/conforma-web-app) form builder, for conditional visibility and validation rules that go well beyond what a validation library offers
- Configurable [decision trees](https://en.wikipedia.org/wiki/Decision_tree), for branching logic
- Extending [JSON Forms](https://jsonforms.io) with conditional logic and dynamic lookups ([demo](https://github.com/CarlosNZ/jsonforms-with-figtree-demo))

There are around 40 built-in operators, covering logic, comparison, maths, strings, arrays and objects, as well as HTTP, GraphQL and SQL lookups. When those aren't enough, you can [write your own](https://DOCS_URL/custom-operators/).

### [Try it in the Playground](https://DOCS_URL/playground/) <!-- omit in toc -->

## The basics

Under the hood, every expression is a tree. A node is an **operator** plus its parameters, and any parameter can itself be another node, so you can nest them as deep as you need. Each node's result becomes a value for the node above it.

The simplest node:

<!-- prettier-ignore -->
```js
{ $plus: [1, 2, 3] }
// → 6
```

That's the **shorthand** form. Every node also has a **canonical** form that spells everything out, and the two are interchangeable:

```js
{ operator: 'plus', values: [1, 2, 3] }
// → 6
```

Shorthand is nicer to write by hand; the canonical form is easier for tools and editors to work with. Use whichever suits, and mix them freely.

Here's the same result from a deeper tree. One branch checks an answer in the user's data, another asks an API for a number:

```js
{
  $plus: [
    { $if: [{ '$=': ['$data.responses.Q1', 'correct'] }, 1, 0] },
    { $http: { url: 'https://my.server.com/api/get-count', returnPath: 'count' } },
    3,
  ],
}
// → 6
```

<!-- TO-DO: redraw for v3 syntax (plus / if / equal / http) -->

![Expression tree](docs/img/Example_1.png)

<details>
<summary>The same expression in canonical form</summary>

```js
{
  operator: 'plus',
  values: [
    {
      operator: 'if',
      condition: { operator: 'equal', values: ['$data.responses.Q1', 'correct'] },
      then: 1,
      else: 0,
    },
    { operator: 'http', url: 'https://my.server.com/api/get-count', returnPath: 'count' },
    3,
  ],
}
```

</details>

## When things go wrong

Expressions often come from people, and they often run against data you didn't write, so FigTree is strict where it can be and forgiving where it has to be.

Any node can carry a `fallback`, which stands in when that node fails, for example on a bad API response or a division by zero:

```js
{ $divide: ['$data.total', '$data.count'], fallback: 'No orders yet' }
// with count: 0 → 'No orders yet'
```

Mistakes in the expression itself are caught before anything runs:

```js
fig.validate({ $plsu: [1, 2] })
// → '$plsu' is not a registered operator or fragment — did you mean '$plus'?
```

And there's no silent type coercion: `{ $plus: [1, 'two'] }` is an error, not `'1two'`.

## Install

```sh
npm install fig-tree-evaluator
```

FigTree is ESM-only, written in TypeScript with its types included, and needs Node 22.12 or later (or any modern browser).

## Usage

```ts
import { FigTree } from 'fig-tree-evaluator'

const fig = new FigTree()

const result = await fig.evaluate(expression, { data: { user, responses } })
```

HTTP and SQL operators need a client, which you choose and pass in. This keeps them out of your bundle if you don't use them, and out of your expressions if you don't want them there:

```ts
import { FigTree, coreOperators, httpOperators, FetchClient } from 'fig-tree-evaluator'

const fig = new FigTree({
  operators: [coreOperators, httpOperators(new FetchClient())],
})
```

## Documentation

The full documentation is at **[DOCS_URL](https://DOCS_URL/)**:

- **[Concepts](https://DOCS_URL/concepts/)**: how expressions are built and evaluated, data references, shorthand and canonical forms
- **[Guides](https://DOCS_URL/guides/)**: options, fallbacks and errors, fragments, HTTP and SQL, caching, tracing
- **[Operator reference](https://DOCS_URL/operators/)**: every built-in operator and its parameters
- **[Custom operators](https://DOCS_URL/custom-operators/)**: adding your own with `defineOperator`
- **[Tooling](https://DOCS_URL/tooling/)**: `./format`, `./authoring` and `./catalog`, for building editors and other tools around FigTree
- **[Migrating from v2](https://DOCS_URL/migrating/)**: the converter, and what it can't do for you

For a visual editor in your own app, see [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react).

## Help, feedback, suggestions

Please [open an issue](https://github.com/CarlosNZ/fig-tree-evaluator/issues).

## Credit

Icon: Tree by ka reemov from [Noun Project](https://thenounproject.com/icon/tree-2665898/)
