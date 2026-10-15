# Docs voice guide

How the v3 docs site is written, distilled from Carl's rewrites of drafted pages. Each entry is a rule and an example taken from a real edit. It grows a page at a time, through the last stage of the `/write-page` skill ([.claude/skills/write-page/SKILL.md](../.claude/skills/write-page/SKILL.md)).

Entries are revised rather than duplicated when a later edit refines or contradicts them.

## Tone

- **Relaxed and plain, not formal, but never imprecise.** Round a number where the exact figure would go stale, but swap a casual word for the exact one where the casual one is slightly wrong.
  - Before: "An expression is a value that can work something out."
  - After: "A **FigTree expression** is a bit of plain JSON, structured as a _tree_, that can work something out."
  - Before: "FigTree has 40 built-in operators"
  - After: "FigTree has 40-ish built-in operators"
  - Before: "Where an operator needs a yes or no"
  - After: "Where an operator needs true or false"
- **Bold a key term where it's introduced:** **FigTree expression**, **parameters**, **modifiers**.
- **Emphasise the contrast.** Where parallel items differ by a word or two, italicise those words. In a code comment, which can't, capitals do the same job.
  - Before: "for values that stay the same from one evaluation to the next … for what changes every time"
  - After: "for values that _stay the same_ from one evaluation to the next … for what _changes_ every time"
  - Before: `// Missing and null are both passed over`
  - After: `// Missing AND null are both passed over`

## Wording

- **FigTree's design principle has one wording: _strict where it can be, and forgiving where it has to be_,** as the README puts it. Use it as written wherever the principle comes up, so it reads as a slogan rather than a paraphrase.
  - Before: "Strict when checked, forgiving when run" (a heading in Why FigTree is shaped this way)
  - After: "Strict where it can be, and forgiving where it has to be"
- **Say "a key prefixed with `$`" (or "`$`-prefixed key"), never "`$` key".** The short form leans on a term the reader has to remember from earlier; the long one describes the key wherever it appears.
  - Before: "An object in an expression with a `$` key is read as a node."
  - After: "An object in an expression that has a key prefixed with `$` is read as a node."
- **Describe the effect, not the mechanism.** How FigTree achieves something is implementation detail; what the reader sees is the point.
  - Before: "It's allowed on any object, a node or plain data, can hold any value, and is removed before evaluation, so it never appears in a result"
  - After: "It's allowed in any object, whether a node or a plain object, and has no effect on the result"
- **Be concrete: say who it helps, and what's at stake.**
  - Before: "The _canonical_ form … names everything, and is the one tools work with."
  - After: "The _canonical_ form … names everything, which makes it easier to work with in a visual editor, like the one in this site's playgrounds."
  - Before: "a node that needs two requests sends both at once"
  - After: "a node that needs two slow network requests sends both at once"
- **Name the actual difference, not an abstraction of it, and drop qualifiers that don't bear on the point.**
  - Before: "There are two ways, and they differ in what counts as a gap"
  - After: "There are two ways, and they differ in how they treat a value stored as `null`"
  - Before: "an optional field left blank"
  - After: "a form field left blank"
- **Show a simple thing simply.** An example in passing does more than a sentence spelling it out.
  - Before: "So a string like `$data.user.name` gets replaced by the `name` field of the `user` object you gave it."
  - After: "You pass this data to FigTree when evaluating an expression, and `$data` references, such as `$data.user.name`, read from it."
- **One word, once a sentence.** Where a word repeats, rephrase so it appears once.
  - Before: "You pass this data to FigTree when evaluating an expression and it becomes accessible inside the expression via `$data` references."
  - After: "You pass this data to FigTree when evaluating an expression, and `$data` references … read from it."
  - Before: "With `from`, the path starts inside the `from` value, so it has no `$data`"
  - After: "Here, the path references the lookup table, so it has no `$data`"
- **Mark a list of examples before it starts, with "such as" or "for example", never "etc." after it.** A bare colon list reads as the complete set, so keep it for lists that are. In a bullet, terseness wins, and a bare list of examples is fine.
  - Before: "Real data has gaps: an optional field left blank, a user without a middle name."
  - After: "Real data has gaps, such as a form field left blank or a user without a middle name."
  - Kept, in a bullet: "for values that _stay the same_ from one evaluation to the next: app settings, a lookup table, the signed-in user"
- **Frame a design choice by what it gives the reader, not what it costs.** Wording that reads as a shortcoming makes the library sound like it's apologising.
  - Before: "evaluation is always asynchronous, even when there's nothing to wait for"
  - After: "evaluation is always _asynchronous_. Your code awaits every expression the same way, so it never needs to know what's inside one"
- **Define by what the reader sees, and never use a term inside its own definition.** Name each option, then say what it looks like.
  - Before: "**An array** gives them in order, for operators that have a positional form."
  - After: "**Positional:** an array, where each value's position says which parameter it is."

## Punctuation and formatting

- **No full stop on a one-sentence summary,** such as a page's frontmatter `description`. Full stops only where there's more than one sentence.
  - Before: `description: The order nodes are evaluated in, and what the engine checks along the way.`
  - After: `description: 'What the engine does with an expression: the checks before it runs, the order it runs in, and how it treats types, nulls and failures'`
- **A reference in prose takes no quotes.** Quotes only where the point is that it's a string.
  - Before: "a bare `'$data'` gives the whole data object"
  - After: "a bare `$data` gives the whole data object"
  - Kept: "Any other string is plain text, even one starting with `$`, such as `'$5.00'`."

## What to leave out

- **Don't answer worries the reader doesn't have.** Reassurance about an edge case nobody would wonder about yet only plants the doubt.
  - Cut: "There's no setting to make FigTree look deeper or shallower: it always looks all the way down. Nodes are found once, when FigTree first reads the expression, and never in the data it's evaluated with, so a value in your data that happens to look like a node is never run."
  - Cut: a "No .length" callout on Data references, when nothing on the page suggested a path could read `.length`
  - Cut: a "firstOf under strictDataPaths" callout, straight after the paragraph that had already said how to allow a missing value
- **On a page that explains an idea, point to the reference rather than embedding it.** A sentence and a small snippet, with a link to the full entry. A list that isn't complete stays short, and is marked as examples (see Wording).
  - Before: the full `<OperatorReference names={['if']} />` entry in Expressions and nodes
  - After: one sentence on what `if` does, a short canonical/shorthand snippet, and a link to the operator reference
  - Before: "A few more operators work this way: `and` and `or` …, and `map`, `filter` and the other iterating operators…"
  - After: "Other operators work this way too: `and` and `or`, for example, …"
- **Only what the reader can place here.** Cut what an earlier page already covered, and allusions to features they haven't met. A closing pointer teases the one thing they'll want next.
  - Cut: "(The `http` operator is there when your app gives FigTree an HTTP client …)", already covered in Expressions and nodes
  - Before: "covers fallbacks in full: reading what went wrong with `$error`, a fallback for every use of an operator, and the errors your app receives"
  - After: "A fallback can do more than stand in with a fixed value, too: with `$error`, it can actually read what went wrong."
- **Precise, but uncluttered.** A strictly technical point goes in a footnote rather than the text.
  - Example: what "node" means in graph theory, as a footnote to "trees have nodes (as well as plain values at the leaves)"

## Structure

- **Lists for options that each need a description,** nested where the options fall into groups.
  - Before: "a node can carry a few modifiers …: `fallback`, the value to use if it fails (…); `vars`, values named once and read anywhere below (…); `noCache` (…); and `//`, a comment (…)."
  - After: one bullet per modifier, each with its description and link
  - Example: the ways to give parameters, as **Canonical form** and **Shorthand form**, with the three shorthand forms nested under it
- **Motivate before you define.** Open with why it matters, or an example of the difference, then name the mechanism. A new mechanism comes in through one the reader already knows, with the cases that need it.
  - Before: "A failure while running … fails its node. The failure travels up the tree…"
  - After: "An unhandled runtime error … makes the whole evaluation throw a `FigTreeError`. This is where fallbacks come in…"
  - Example: Null handling shows four operators treating the same `null` differently before it says "null policy"
  - Before: "A reference's path is fixed when the expression is written. When the path itself depends on the data, … `get` takes it as a parameter"
  - After: "A `$data` reference is really just a convenient way to write a `get` operator … Most of the time, it's all you need, but there are a few cases where you need to write it the long way:", then the cases as bullets
- **The obvious idea first, the full syntax later.** A syntax the reader can mostly guess goes near the end, as reference, described against what they already know, with only the differences listed.
  - Before: "Paths" third on Data references: "A path is read left to right, each step going one level deeper:", then every kind of step
  - After: "Path syntax" just before the summary table: "For the most part, paths are written as you'd write them in JavaScript … There are a couple of extensions, though:", then `[*]` and array paths
- **Most common first.** Options, bullets and an example's keys go in the order the reader will most often need them.
  - Before: `firstOf`, then `get`'s `default`; `get`'s uses as a computed path, a `default`, a `from`
  - After: `default` first in both
- **Asides go in callouts, out of the paragraph flow: a tip, a gotcha, a design reason.** They also break up a long run of prose. A gotcha callout shows the wrong way and the right way in an example, not just advice. Rarely two in a row, and related ones merged. The rule a section exists to state isn't an aside: it stands apart as a blockquote.
  - Before: "Since `0` counts as false, test numbers explicitly…" in the paragraph
  - After: a "Zero counts as false" caution, with `bare` against `explicit` on a free item
  - Before: a Note ("Another way to write a node") directly followed by a Caution ("Data with $ keys"), plus a separate Note in the next section
  - After: one Caution at the end of Operators, "Every key prefixed with $ is checked", covering both
  - Example: the truthiness rule, as a blockquote

## Examples

- **Real-world examples with realistic values,** whose outcomes are things a real expression would produce, and differ visibly. They get readers thinking about their own uses.
  - Examples: a GST price that rounds to `$92.56`, a stored MongoDB query, a notification config
  - Before: `'Hi %1'` against `'Hi there'`; `'Stock level known'` against `'No stock level'`
  - After: `'Call %1'` against `'No phone number on file'`; `'$0'` against `'Price data missing'`
- **Put each named parameter on its own line,** so the names stand out beside the operator.
  - Before: `named: { $if: { condition: '$data.isMember', then: 'Member price', else: 'Standard price' } }`
  - After: `condition`, `then` and `else` each on a line of their own inside `$if`
- **A result shown in a code comment is marked with `=>`,** so it reads as what the line gives, not as a remark about it.
  - Before: `const sum = await fig.evaluate({ $plus: [1, 2] }) // 3`
  - After: `const sum = await fig.evaluate({ $plus: [1, 2] }) // => 3`
- **One example, one idea.** Don't combine two features where one could be mistaken for the normal form of the other, and leave out a detail that hints at a problem the example doesn't have.
  - Before: one `get` example with `path: '$data.user.language'` beside a `from` table, which reads as though a path beside `from` starts with `$data`
  - After: `path: 'mi'` beside the table first, then the same example with only the `path` line computed
  - Before: `{ $get: { path: ['items', 0, 'key.with.dots'] } }`, though an array path needs no quoting
  - After: `{ $get: { path: ['items', 0, 'price'] } }`
- **In host code, a call that doesn't fit on a line puts each argument on its own line,** and the expression stays on one line where it fits. Where the example is about a parameter, use the named form.
  - Before: `await fig.evaluate({ $get: ['customer.email', null] }, { data }) // => null`
  - After: `{ $get: { path: 'customer.email', default: null } }` and `{ data }` each on a line of their own inside `fig.evaluate(` … `) // => null`
- **Comments in an example point at what to notice or try, for the point the example makes.** They say what happens, in plain words, not the name of a category. Where changing a value would show the point, say which value to change and what it shows. A comment about a different lesson pulls the reader off this one.
  - Before: `// Passed on: plus doesn't run`
  - After: `// Can't be worked out without the shipping cost, so gives null`
  - Example: `// Add an actual phone number to see the change`, in the data of the truthiness example
  - Where the change is to add values, give them as commented-out lines to uncomment, so the reader gets realistic values for one keystroke: `// Uncomment shipping and decimals to see each value change` above `// shipping: 5.5,` and `// decimals: 2,`
  - Before: `// Change 'two' to a number, or 1 to a string to fix the error`, on an example about fallbacks not catching static errors
  - After: no comment, since the prose already carries the point
