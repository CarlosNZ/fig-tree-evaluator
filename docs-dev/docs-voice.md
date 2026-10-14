# Docs voice guide

How the v3 docs site is written, distilled from Carl's rewrites of drafted pages. Each entry is a rule and an example taken from a real edit. It grows a page at a time, through the last stage of the `/write-page` skill ([.claude/skills/write-page/SKILL.md](../.claude/skills/write-page/SKILL.md)).

Entries are revised rather than duplicated when a later edit refines or contradicts them.

## Tone

- **Relaxed and plain, not formal.** Round a number where the exact figure would go stale.
  - Before: "An expression is a value that can work something out."
  - After: "A **FigTree expression** is a bit of plain JSON, structured as a _tree_, that can work something out."
  - Before: "FigTree has 40 built-in operators"
  - After: "FigTree has 40-ish built-in operators"
- **Bold a key term where it's introduced:** **FigTree expression**, **parameters**, **modifiers**.

## Wording

- **Say "a key prefixed with `$`" (or "`$`-prefixed key"), never "`$` key".** The short form leans on a term the reader has to remember from earlier; the long one describes the key wherever it appears.
  - Before: "An object in an expression with a `$` key is read as a node."
  - After: "An object in an expression that has a key prefixed with `$` is read as a node."
- **Describe the effect, not the mechanism.** How FigTree achieves something is implementation detail; what the reader sees is the point.
  - Before: "It's allowed on any object, a node or plain data, can hold any value, and is removed before evaluation, so it never appears in a result"
  - After: "It's allowed in any object, whether a node or a plain object, and has no effect on the result"
- **Say who it helps, concretely.**
  - Before: "The _canonical_ form … names everything, and is the one tools work with."
  - After: "The _canonical_ form … names everything, which makes it easier to work with in a visual editor, like the one in this site's playgrounds."
- **Define by what the reader sees, and never use a term inside its own definition.** Name each option, then say what it looks like.
  - Before: "**An array** gives them in order, for operators that have a positional form."
  - After: "**Positional:** an array, where each value's position says which parameter it is."

## What to leave out

- **Don't answer worries the reader doesn't have.** Reassurance about an edge case nobody would wonder about yet only plants the doubt.
  - Cut: "There's no setting to make FigTree look deeper or shallower: it always looks all the way down. Nodes are found once, when FigTree first reads the expression, and never in the data it's evaluated with, so a value in your data that happens to look like a node is never run."
- **On a page that explains an idea, point to the reference rather than embedding it.** A sentence and a small snippet, with a link to the full entry.
  - Before: the full `<OperatorReference names={['if']} />` entry in Expressions and nodes
  - After: one sentence on what `if` does, a short canonical/shorthand snippet, and a link to the operator reference
- **Precise, but uncluttered.** A strictly technical point goes in a footnote rather than the text.
  - Example: what "node" means in graph theory, as a footnote to "trees have nodes (as well as plain values at the leaves)"

## Structure

- **Lists for options that each need a description,** nested where the options fall into groups.
  - Before: "a node can carry a few modifiers …: `fallback`, the value to use if it fails (…); `vars`, values named once and read anywhere below (…); `noCache` (…); and `//`, a comment (…)."
  - After: one bullet per modifier, each with its description and link
  - Example: the ways to give parameters, as **Canonical form** and **Shorthand form**, with the three shorthand forms nested under it
- **Callouts are for asides: rarely two in a row, and related ones merged.** Back-to-back callouts weaken each other and clutter the section.
  - Before: a Note ("Another way to write a node") directly followed by a Caution ("Data with $ keys"), plus a separate Note ("Caught before anything runs") in the next section
  - After: one Caution at the end of Operators, "Every key prefixed with $ is checked", covering both

## Examples

- **Real-world examples with realistic values.** They get readers thinking about their own uses.
  - Examples: a GST price that rounds to `$92.56`, a stored MongoDB query, a notification config
- **Put each named parameter on its own line,** so the names stand out beside the operator.
  - Before: `named: { $if: { condition: '$data.isMember', then: 'Member price', else: 'Standard price' } }`
  - After: `condition`, `then` and `else` each on a line of their own inside `$if`
