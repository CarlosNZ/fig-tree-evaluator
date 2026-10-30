# Docs voice guide

How the v3 docs site is written, distilled from Carl's rewrites of drafted pages. Each entry is a rule and an example taken from a real edit. It grows a page at a time, through the last stage of the `/write-page` skill ([.claude/skills/write-page/SKILL.md](../.claude/skills/write-page/SKILL.md)).

The bold headlines are the checklist: scan them against a draft. The examples calibrate how far each rule goes.

**Adding to it:** an edit that a rule already covers changes nothing here, unless it shows a side of the rule the existing examples don't, and then it replaces the weaker example rather than joining it. A rule keeps one or two examples. A new pattern that overlaps an existing rule is merged into it, so each idea lives in one place.

## Tone

- **Relaxed and plain, but never imprecise.** Round a figure that would go stale, but swap a casual word for the exact one where the casual one is slightly off. A relaxed phrase beats strict parallel wording.
  - Before: "FigTree has 40 built-in operators"; "Where an operator needs a yes or no"
  - After: "FigTree has 40-ish built-in operators"; "Where an operator needs true or false"
  - Before: `// and the same again, with the forms mixed`, matching the "is the same as" comments above it
  - After: `// You can mix and match freely`
- **Where JavaScript is the reference, mark where FigTree differs.**
  - After: "`find`: `null` (where JavaScript gives `undefined`)"
- **Bold a key term where it's introduced:** **FigTree expression**, **parameters**, **result cache**.
- **Emphasise the contrast.** Where parallel items differ by a word or two, italicise those words; in a code comment, capitals do the same job. Parallel options each get their own bullet, so the contrast lines up.
  - Before: "for values that stay the same from one evaluation to the next … for what changes every time"; `// Missing and null are both passed over`
  - After: "for values that _stay the same_ … for what _changes_ every time"; `// Missing AND null are both passed over`
  - Before: "**`some`** and **`every`**: `true` if any element's result is truthy, or if every one is."
  - After: "**`some`**: `true` if _any_ element's result is truthy." and "**`every`**: `true` if _every_ element's result is truthy."

## Fixed terms

- **FigTree's design principle has one wording: _strict where it can be, and forgiving where it has to be_,** as the README puts it, so it reads as a slogan rather than a paraphrase. The pages already use it enough: offer it to Carl as a suggestion where it fits, never write it in unasked, and don't build an intro's framing around it.
  - Before: a stand-in opening "Errors no fallback catches" with "FigTree is _strict where it can be, and forgiving where it has to be_, and these are the strict cases:"
  - After: "Some errors won't be caught by a fallback, by design — errors that should be handled during authoring, or are due to defined resource limits or manual cancellation, must be dealt with separately:"
- **"A key prefixed with `$`" (or "`$`-prefixed key"), never "`$` key".** The short form leans on a term the reader has to remember.
- **The people who write expressions are "configuration authors".** Never phrase a scenario so it implies end users write them.
- **An operator _returns_ its result**, never "gives".
- **Nodes _fail_; evaluations _throw_.** A node's failure becomes a throw only when no fallback catches it.
  - Before: "with the node that threw marked `failed`"
  - After: "with the node the error came from marked `failed`"
- **Only people and FigTree act.** A node, value or parameter doesn't write, decide or determine anything: name the configuration author, the host or FigTree.
  - Before: "the parameters the node writes"; "allows other nodes in an expression to determine if…"
  - After: "the parameters the configuration author wrote on the node"; "FigTree can tell, before anything runs, whether…"
- **Where a method and a definition field share a name, write the method as `fig.validate()` or `fig.evaluate()`,** wherever both are in play, and say when each runs.
  - Before: "**`compile()` and `evaluate()`**: the first time an expression is compiled", on a page about an operator's `evaluate`
  - After: "**`fig.compile()` and `fig.evaluate()`**: … Compiling is the first thing `fig.evaluate()` does, before it evaluates any nodes"
- **The concept's name in prose, the syntax only in code.**
  - Before: "A var's name can be any string…"
  - After: "A variable's name can be any string…", with `vars` and `$vars` kept for the syntax
- **No spec or implementation terms where a plain word or the API name does.** A spec statement that only matters to the library's own design is cut.
  - Before: "merged by key"; "before the body runs"
  - After: "merged"; "before calling `evaluate`" (kept: "merged by name", which says what the keys are)
  - Cut: "`ErrorCodes` is the only list of the codes at runtime."
- **Never coin a name.** Describe a check by its input, and a summary uses the feature's own name.
  - Before: "plus the sample-data check"; "Returns a record of the evaluation with its result"
  - After: "and, when given `data`, checks the expression's `$data` paths against it"; "Returns a trace of the evaluation, with the result"
- **Label the cases in an example with the site's own terms:** plain words, with the term the reader meets elsewhere in brackets.
  - After: "a string where a number is needed is a `type-check` error, whether it's written into the expression (static) or computed as it runs (runtime)."

## Precise wording

- **Name the actual thing, not an abstraction or a vague stand-in.** Say what the difference is, what the operation is (not "is" or "are"), what does the action, and what the reader would otherwise have to do. Drop qualifiers that don't bear on the point, and add the one that does.
  - Before: "they differ in what counts as a gap"; "a set such as `coreOperators` goes in as it is"
  - After: "they differ in how they treat a value stored as `null`"; "can go in without being spread"
  - Before: "An `http` request's headers are `http.headers`, then the node's own `headers`."; "When a runtime failure isn't caught"
  - After: "…are merged from `http.headers`, then the node's own `headers`, each one overriding the one before."; "When no fallback catches a runtime failure"
  - Added: "a _global_ `timeout`", to tell it apart from the per-request one
- **Don't pick a word, or an example, that implies more than is true.** Where an example happens to come out better than the API promises, change it so it shows the difference.
  - Before: "A value stored as `null`…"
  - After: "A data value that is actually `null`…", since it doesn't have to be stored
  - Before: `toShorthand(canonical, fig) // => the same as average`, true only because `average` was already positional
  - After: an `average` with a named `$divide`, its output shown back in positional form, and "Note the `$divide` here has come back in positional form…"
- **State a requirement flatly, and a convention as a recommendation.** A "can" or "might" inside a rule makes it sound vague. But where something is good practice rather than enforced, say what the core operators do and when the reader would want the same.
  - Before: "The key should include everything that can change what `fn` returns."
  - After: "The key should include everything `fn`'s result depends on."
  - Before: "To fail the same way every time, throw the one with the lowest `index`, as the core operators do"
  - After: "The core operators throw the failure with the lowest `index` instead… — we recommend doing the same if a consistent error response is desired."
- **Where two of a kind are in play, name each by its role.**
  - Before: "with this one's options and an update applied, leaving this one as it is", on `with()`
  - After: "with the original's options and an update applied, leaving the original instance as is"
- **Anchor a term to what it belongs to,** so a section still reads clearly to someone who lands on it from a link.
  - Before: "`getDependencies()` lists the `$data` paths…"; "An **error** is something `evaluate()` would refuse to run."
  - After: "FigTree's `getDependencies()` method lists…"; "An issue with severity `'error'` is something…"
- **Define by what the reader sees, and never use a term inside its own definition.**
  - Before: "**An array** gives them in order, for operators that have a positional form."
  - After: "**Positional:** an array, where each value's position says which parameter it is."
- **A summary of several things is true of each of them, and a list's items are distinct.** None contains another, and none reads as a gloss on the one before.
  - Before: "What every request … shares: a base for relative URLs, a GraphQL endpoint, and headers", where only the headers are shared
  - After: "Defaults for requests from the `http` and `graphQL` operators: a base that relative URLs are joined to, an endpoint for GraphQL queries, and headers to send with every request"
  - Before: "exports the operator sets, what you need to write operators of your own, the I/O operators and their clients"
  - After: "exports the core operators, the I/O operators with their HTTP and database clients, the helpers for writing operators of your own"

## Sentences

- **One word, once a sentence.** Where a word repeats, rephrase.
  - Before: "With `from`, the path starts inside the `from` value, so it has no `$data`"
  - After: "Here, the path references the lookup table, so it has no `$data`"
- **Split a sentence rather than stack its commas.** Where the second half opens with a clause of its own, make it a sentence.
  - Before: "This example fetches a random user from randomuser.me, and since the response is cached, it's the same user however many times you run it:"
  - After: "…from randomuser.me. Since the response is cached, it's the same user…"
- **Give a sentence a real subject, never "What …".** A "what" clause as the subject or a whole fragment reads as childish. A short table-cell description such as "What `compile()` returns" is fine.
  - Before: "What most apps never need, such as the v2 converter, is in subpaths"
  - After: "The tools for authoring and migration, such as the v2 converter, are in four subpaths"
- **A connective says how the points really relate:** "so" only for a consequence, "But" for a limit on what came before, "since" (not "the exception is") for a case that follows from the rule.
  - Cut: "`CompiledExpression` is exported as a type only, so `compile()` is the only way to make one…"
  - Before: "The exception is `noCache`: …"
  - After: "Since `noCache` only ever takes `true`, a default `noCache: true` turns off caching…"
- **Lead with what happens, not a "never … because" opener,** which reads two ways, **or a denial of an idea nobody raised** ("Going in order and stopping early aren't settings" → "The order, and when to stop, are up to `evaluate`"). Where there's a way round a rule, present it as how to get what the reader wants, not as an exception to a "no".
  - Before: "**Throws:** never because of what's in the expression, however broken. It throws `invalid-options` when…"
  - After: "**Throws:** `invalid-options`, only when the options are wrong: … A problem in the expression, however serious, is reported in `issues` instead."
  - Before: "No fallback catches a timeout, and none starts once time has run out. The one exception is timeout shielding."
  - After: "A timeout stops everything, fallbacks included… To return a value in place of a timeout, give the expression a plain-value fallback at the top"
- **"These", "this" and "here" point at what's right beside them.** Pointing ahead is fine as the last words before the list or example meant; anywhere else, name the thing. "We" is fine for walking through an example. A bullet opens with the thing's name, not "It" or "this default", since bullets get moved.
  - Before: "Every error `validate()` reports is one of these. Each is a static error…", with the list after the second sentence
  - After: "Every error `validate()` reports is a static error… These are all of them:"
  - Before: "It covers every path into a value", which ended up straight after a `firstNonNull` bullet
  - After: "`strictDataPaths` covers every path into a value"
- **Mark a list of examples before it starts, with "such as" or "for example", never "etc." after it.** A bare colon list reads as the complete set. In a bullet, terseness wins.
  - Before: "Real data has gaps: an optional field left blank, a user without a middle name."
  - After: "Real data has gaps, such as a form field left blank or a user without a middle name."

## What to say

- **Describe the effect, not the mechanism, or a label for it.** Where a term stands for an outcome, say the outcome. Where the reader has something to write or do, say exactly what, especially where a phrase could be read two ways. An instruction names the exact control and says how to read what the reader will see.
  - Before: "**Passed on**", in the table of what a `null` does at a parameter
  - After: "makes the whole node return `null`"
  - Before: "Give it `from: '$vars'`, and the path's first key names the variable"
  - After: "Give it `from: '$vars'`, and start the path with the variable's name"
  - After: "Press the $if button at the top of the tree, and each part is coloured by how it ran: orange where a fallback was used (the division), green where it returned a value, and dimmed where it never ran (the then branch)."
  - An example whose point is in the editor says so on the page, since its caption only shows inside the editor: "Open this example in the editor to see a visual representation of the trace."
- **Where a limitation has a simple workaround, give the recommendation and a one-clause reason, not the mechanism.** "We" is fine. A reference page doesn't describe the route a guide recommends against, even as a limitation.
  - After: "We don't recommend turning tracing on with `updateOptions()` or `with()`, since TypeScript can't see the change, and still expects `evaluate()` to return the bare result. Pass `trace: true` to the constructor or the call instead."
- **Be concrete: say who it helps, what's at stake, and the reason the reader would actually decide by.** Each reason in a list is one the reader can picture; drop a weak one rather than pad. A thin use case is worse than none, and a scenario has to match how the feature is really used.
  - Before: "The _canonical_ form … names everything, and is the one tools work with."
  - After: "…names everything, which makes it easier to work with in a visual editor, like the one in this site's playgrounds."
  - Before: "Set it to `'post'` for an API that takes its question as a body"
  - After: "Set it to `'post'` for an endpoint that expects a POST"
  - Cut: "…to offer a smaller set in an editor where people with less experience write rules", as the reason to leave operators out
- **Give the real reason in a clause, or none.** If a feature is missing because it hasn't been built, say it isn't there and stop: a weak justification invites argument, and so does a true reason that implies it's the only one. A sentence that only describes the rule's effect isn't a reason: state the rule, and how to get what the reader wants.
  - After: "For security reasons, a header's value never appears in a failure or a trace."
  - Before: "**Optional, with no `default`:** when the replacing parameter isn't given, the target's own null policy applies, as if it weren't there."
  - After: "**Optional, with no `default`.** A host that wants a replacement on every node can set one in `operatorDefaults`."
  - Cut: "the root never imports them, so an app that doesn't import one doesn't carry it", since the root entry is tree-shaken too
- **Frame a design choice by what it gives the reader, not what it costs.** Lead with what's available, not the constraint that comes with it; where something stays fixed by design, say what stays fixed, not how to get round it.
  - Before: "evaluation is always asynchronous, even when there's nothing to wait for"
  - After: "evaluation is always _asynchronous_. Your code awaits every expression the same way, so it never needs to know what's inside one"
  - Before: "The `operators` option is the instance's whole set of operators, so giving it replaces the core operators rather than adding to them…"
  - After: "The core operators are included by default. The package also has these, which you can add:"
- **Mark a special case as special,** so the reader doesn't generalise it and wonder what else works that way.
  - Before: "Its `nullPolicy` is conditional, so it can provide a _function_"
  - After: "For a case like this, `nullPolicy` can be a _function_ (the _only_ field that can)"
- **For a feature the reader could build by hand, say what declaring it gives over doing it in their own code,** not only what it does, since they'll ask why they shouldn't just write it themselves.
  - Before: "With `truthiness: true`, whatever value the parameter receives is read as `true` or `false`, by FigTree's truthiness rule."
  - After: "Declaring it, rather than testing the value in `evaluate`, means:", then a missing condition counting as false, agreeing with the core operators, and working per element
- **Spend the words on what the reader doesn't know.** A mechanism they already know, such as memoising, gets a clause. The explanation and the example go to what's particular to FigTree and what they have to decide, and an API they might not reach for opens with why they'd use it.
  - Before: "The first call runs `fn` and keeps its result under the key, and a later call with an equal key returns the kept result without running `fn`."
  - After: what goes in the key and what stays out, shown on a simplified `http`: "**Not in the key:** whatever doesn't change the response…"
  - Before: "The core `buildObject` records an event when it's given the same key twice:", then the whole definition
  - After: "A note is for something `evaluate` decides quietly, which the result doesn't show, but which someone debugging an expression would want to know."
- **Give the idea behind a rule before its letter.**
  - Before: "A fallback counts as a plain value when it's built only from fixed values and `$error` reads"
  - After: "A fallback counts as a plain value when there's nothing to evaluate: it's built only from fixed values and `$error` reads"
- **State the general rule, and fold in the case that prompted it,** or the reader may take the case for an exception.
  - Before: "An instance made with `with()` starts with an empty cache of its own…"
  - After: "Every new FigTree instance, including one made with `with()`, starts with an empty cache of its own…"
- **Mark a default as a default** where the reader can change it: "By default, a result is kept for 30 minutes…"
- **Show a simple thing simply.** An example in passing does more than a sentence spelling it out. Where describing a shape would get convoluted, show it first.
  - Before: "So a string like `$data.user.name` gets replaced by the `name` field of the `user` object you gave it."
  - After: "You pass this data to FigTree when evaluating an expression, and `$data` references, such as `$data.user.name`, read from it."
  - Before: "`path`: where the problem is, as the keys and indices from the root of the expression as it was written"
  - After: "`path`: where the problem is, as an array of keys and indices, such as `['$if', 'thn']` in the example above"

## What to leave out

- **No signposting sentences.** Headings already say what's coming.
  - Cut: "The sections below cover these."
- **Don't answer worries the reader doesn't have.** This covers reassurance about an edge case nobody would wonder about, a restriction met only by trying something unusual when the error explains itself, detail they'll see once they meet it, design advice they'll only need while building, and anything that already follows from rules they have. But where a mistake fails confusingly, or not at all, a short warning stays.
  - Cut: "There's no setting to make FigTree look deeper or shallower: it always looks all the way down…"
  - Cut: "Children are always listed in the same order, whatever order they finished in, so two traces of the same expression line up."
  - Cut: "`operator` takes an alias too, such as `'+'`, but never the `$`.", where nothing suggested it wouldn't
  - Kept: "the values follow the query one after another, not in an array of their own", on `sql`, since the array form gets past `validate()` and fails in the database or quietly matches nothing
  - So a concept page shows one static error in an example, never the full list and never the warnings. A guide whose job is to list them (Checking expressions) lists them.
- **Don't restate what a definition or an example already gives.** Its consequences don't need a sentence of their own, and prose doesn't spell out a detail the example just below shows.
  - Cut: a second worked example (`plus` picking up `expect` from `operatorDefaults`), after a bullet had said defaults include the instance's
  - Before: "…and a `path` into the options, such as a `duplicate-operator` at `['operators', 1, 0]`…", above an example showing a path
  - After: "…each with its own `code`, such as `duplicate-operator`, and a `path` into the options"
- **Say who a feature is for once, not beside every detail.**
  - Cut: "so an editor can highlight the right part of it", on an issue's `path`, after the page had said editors use issues
- **Never suggest a use FigTree is designed against, even as a warning.** Naming it plants the idea.
  - Cut: "…so don't put anything in an `each` that mustn't run for every element, such as a `POST` that changes something"
  - Cut: a section on what an operator must handle when it's cancelled, repeated or skipped, ending "An operator that [changes anything outside FigTree] is responsible for what happens…"
- **Advise the reader only on their own use of FigTree,** not on how other tools should handle its output. A warning is framed around what the reader is building, not around why FigTree's own feature works the way it does.
  - Cut: "code that reads a trace, such as a debug panel or a logger, should pass over an event whose `type` it doesn't recognise"
  - After: "To let configuration authors rename `$element` in an iterator of your own, declare a parameter named `as` with `evaluationMode: 'structural'`…", rather than why the core iterators' `as` has to be known before anything runs
- **Only what the reader can place here.** Cut what an earlier page covered, and allusions to features they haven't met; a bare API name that means nothing yet is better described by what it does. Not strict: a later feature is fine where it makes an important point and is clear without its page.
  - Before: "`validate()` also warns about two things…", on a page that hadn't mentioned `validate()`
  - Before: "covers fallbacks in full: reading what went wrong with `$error`, a fallback for every use of an operator, and the errors your app receives"
  - After: "A fallback can do more than stand in with a fixed value, too: with `$error`, it can actually read what went wrong."
- **Explain a thing once, in its home; elsewhere, point to it.** On a page about an idea, a sentence and a small snippet with a link beat an embedded reference entry. A feature with its own page gets a callout, not a section. A parameter many operators share is explained on the operator reference, not on each page that meets one.
  - Before: the full `<OperatorReference names={['if']} />` entry in Expressions and nodes
  - After: one sentence on what `if` does, a short snippet, and a link
  - Before: a "Finding the gaps" section on Fallbacks and errors, with a `fallbackCoverage()` snippet and its report
  - After: a "Covering the whole expression" tip, ending with a link to `fallbackCoverage()`
- **Where a rule's exceptions are obvious from one or two examples, give those, not the full list.** Completeness belongs in the reference.
  - Before: "A few words are reserved: the node keys, such as `fallback` and `vars`, the reference names, such as `data` and its short form `d`, and `literal`."
  - After: "…or match a reserved word, such as `data` or `fallback`."
- **Precise, but uncluttered:** a strictly technical point goes in a footnote.
  - Example: a footnote saying a GraphQL request is just an HTTP POST, which explains why the `http` headers, failures and caching all apply to `graphQL`

## Structure

- **Motivate before you define.** Open with why it matters, or an example of the difference, then name the mechanism. A new mechanism comes in through one the reader already knows, and never builds on a shape the examples haven't shown.
  - Example: Null handling shows four operators treating the same `null` differently before it says "null policy"
  - Example: Variables opens with **The problem**, an expression repeating the same request three times, then **The solution**
  - Before: "If every outermost node in it has a fallback that's a plain value…", when every example so far had a single node at the top
  - After: "give the node at the top a fallback that's a plain value", then "An expression doesn't have to be a single node, though…"
- **The obvious idea first, the full syntax later.** A syntax the reader can mostly guess goes near the end, described against what they know. In general, bring in a variant through the thing it resembles, and name only the difference.
  - After: "For the most part, paths are written as you'd write them in JavaScript … There are a couple of extensions, though:", just before the summary table
  - Before: "Give `validate()` the names of the parameters the fragment will declare, and it checks the body as registration would"
  - After: "Like with normal expressions, a fragment body can be checked using `validate()`. The only difference is that you must provide a second argument…"
- **Lead with what the reader will use.** Bring in an optional feature by when they'd need it, and say plainly when they won't. Among several options, show the one they'll reach for most. In a list of fields, an optional one says when it's needed, and an opt-in one says it's the reader's choice.
  - After: "The examples on this site are written in _shorthand_ … You won't need [the canonical form] when writing expressions by hand, but it's useful when, for example:"
  - Before: "**`cache`**: `true` for an operator whose results can be cached"
  - After: "**`cache`**: set to `true` if your operator would benefit from caching its results…"
- **Most common first,** for options, bullets, an example's keys, precedence (the usual case, then what overrides it) and a reference page's entries.
  - Before: "takes the instance's default, if it sets one, … and the definition's `default` otherwise"
  - After: "takes the definition's `default`, unless the instance sets a default of its own"
- **Each point goes in the section whose question it answers,** grouped by what it is, not by what it sits next to.
  - Before: `signal` in the Time bullet of Limits, beside `timeout`
  - After: a section of its own, "Cancelling an evaluation": it's the host deciding to stop, not a limit on the expression
- **Set the scene before the rule, and give an example its own paragraph,** opening "In this example", or "Here" as the last words of a lead-in.
  - Before: "Unnamed, `$element` and `$index` belong to the innermost iterator. … as `$order.items` does here:"
  - After: "When one iterator is inside the `each` of another, `$element` and `$index` belong to…", then a new paragraph: "In this example, the outer one is named. …"
- **Keep what's general apart from what's true of one example.** A general remark beside an example reads as a claim about that example: cut it, or move it away. A list after an example is either about the example, keeping only what applies to it and marked as partial, or general rules, with nothing only the example needs. Never a mix.
  - Cut: "A variable nothing reads can't fail.", just before an example whose variable is read, and fails
  - After: "Before calling `evaluate`, FigTree has already (among other things):", without bullets on what `formatNumber` can't return; and the bullets after a simplified `and`, rewritten as rules for any `race` parameter, with its `truthiness` note cut
- **Don't lean on something far up the page.** A recap that matches a table's rows to examples above it is cut. Where a back-reference is needed, it links to what it means.
  - Cut: "`formatNumber`'s `value` is passed on, and `distance`'s `unit` takes its default…", after the null table
  - Before: "which is why `distance`'s `evaluate` reads `from as number[]`"
  - After: "so in the [earlier example](#types-and-constraints), `distance`'s `evaluate` still sees `from` as `unknown[]`, which requires a cast"
- **Lists for options that each need a description,** nested where they fall into groups; **a shape as its type**, where some keys are typed and others are convention, with comments carrying only what the type can't say.
  - Before: "a node can carry a few modifiers …: `fallback`, the value to use if it fails (…); `vars`, …; `noCache` (…); and `//`, a comment (…)."
  - After: one bullet per modifier
- **A comparison across cases goes in a table,** with code only for the inputs and a "Why" column in place of comments.
  - Before: commented expressions, each followed by `literalParams // => …` and `authored // => …` with a comment on each
  - After: each expression in a `json5` block, then a table of its parameters: In `literalParams`, In `authored`, Why
- **On a guide page, an option's prose says what it's for and when you'd use it.** Its rules go in a callout, and its precise edge rules go to the reference.
  - Before: "`maxDepth` limits how deeply an expression nests, counting its plain objects and arrays as well as its nodes"
  - After: "`maxDepth` limits how deep an expression tree can go", with the counting rules in the Options reference
- **Asides go in callouts: a tip, a gotcha, a design reason, a reminder of an earlier page.** They break up long prose. A gotcha shows the wrong way and the right way in an example. Rarely two in a row; merge related ones. The rule a section exists to state isn't an aside: it stands apart as a blockquote. A tool's purpose goes in the intro, not in a warning callout later.
  - Before: "Since `0` counts as false, test numbers explicitly…" in the paragraph
  - After: a "Zero counts as false" caution, with `bare` against `explicit`
  - Before: a Note directly followed by a Caution, plus a separate Note in the next section
  - After: one Caution at the end of Operators, "Every key prefixed with $ is checked", covering both
- **Page openings.** A guide page on an idea Concepts introduced opens with the recap itself, with no intro paragraph or heading, and links back once. A page that covers more than one distinct thing mentions each in its intro, a secondary one in its own short paragraph after the opening example.
  - After: the page opens "[How evaluation works] introduced fallbacks. In short:"
  - Added, after the opening example of Tracing and debugging: "To understand the internal structure of a compiled expression, there's also `inspect()`…"
- **A guide page's headings tend to say what the section does,** or name the confusion it heads off. A guideline: a bare name is fine where it reads better, and in a chapter for advanced readers, so is the technical term.
  - Before: "## `$error`"; "### Fragments and variables"
  - After: "## Reading the failure with `$error`"; "### Fragments vs variables"
  - Before: "## Reading what an instance holds", in Beyond evaluation
  - After: "## Instance introspection"
- **Where the site's UI demonstrates a library feature, lead with the feature,** and present the UI as a way to try it.
  - After: "FigTree offers a few helper functions for converting between forms…", the snippet, then "In the playgrounds on this site, open the editor and hover…"

## Examples

- **Real-world examples with realistic values,** whose outcomes a real expression would produce, and differ visibly. Inputs are ones a casual reader can supply without looking anything up, from the domains FigTree configs live in, such as forms, countries and customers.
  - Before: `'Hi %1'` against `'Hi there'`; `{ country: 'NZ' }`
  - After: `'Call %1'` against `'No phone number on file'`; `country: 'New Zealand'`
- **Show the bare mechanism before the practical use.** Give the inputs and the result plainly first, then the realistic application, so the reader sees what the function does before working out what the usage around it does.
  - Before: only `operators.filter((op) => typesIntersect(op.returns, by.type))`, with a comment listing what it includes
  - After: `by.type`, `plus.returns` and `upper.returns` with their values, two `typesIntersect()` calls on them, then the filter
- **One example, one idea.** Keep only the moving parts the point needs. Don't combine two features where one could pass for the normal form of the other, and leave out any detail that hints at a problem the example doesn't have. A pattern repeated through an example reads as a rule.
  - Before: one `get` example with `path: '$data.user.language'` beside a `from` table, which reads as though a path beside `from` starts with `$data`
  - After: `path: 'mi'` beside the table first, then the same example with only the `path` line computed
  - Before: an `$if` fallback whose else branch was `'$error.message'`, in an example about the fallback's `$divide` failing
  - After: `'Average unavailable'`
  - A setting needed only for the demo stays out of the expression, but a comment says it's in force: `// Caching is OFF for this example, so every run sends a new request`
- **A custom operator in an example does something FigTree can't.** A thin variant of a core operator, which would really be a fragment, suggests operators are for trivial things. To show a declaration, a core operator's own definition is just as good, since they're first class.
  - Before: `yesNo`, an `if`; `fullName`, a `buildString`; `average`, a `plus` over a `length`
  - After: `hash` (SHA-256), `distance`, and the core `if` definition for `truthiness`
- **The reader should grasp an example's premise at a glance,** so their effort goes on the point, not on working out what the example is for.
  - Before: `missingFields`, which "lists which fields of a form are still empty", leaving the reader to work out which fields it expects
  - After: `hash`, which "hashes the whole data object, which would tell whether anything in a form has changed"
- **Start an example in the state that makes the point,** and let a comment say how to reach the others.
  - After: data that fails at runtime, with `// Make these both strings, and it works.`, so the Static error and Runtime error badges sit one above the other
- **An example finishes what the prose just described,** and works under the default setup.
  - Added: `await fig.evaluate(expression) // => 92` at the end of the first example on Setting up FigTree, whose intro says an instance is "called with `evaluate()`"
  - Before: "such as a value of the wrong type, a missing path under `strictDataPaths` or a failed request"
  - After: "such as a parameter of the wrong type, a failed request, or a division by zero"
- **Before an example, name what to look for, and let the example show it.** Where prose explains what an example does, quote the part that causes it and spell out the step from cause to effect.
  - Before: "Its trace has the request as it was sent, with the name from the data in its query string, and a `render` event for each token…"
  - After: "Its trace has a `request` event, and some `render` events:"
  - Before: "`value`'s type includes `null`, so a `null` there makes the node return `null`"
  - After: "the `value` parameter is declared as `['number', 'null']`, so it accepts `null`, and by default a `null` there is passed on"
- **Comments point at what to notice or try, for the point the example makes,** in plain words, not category names or compressed notation. Say which value to change and what it shows; where the change adds values, give them as commented-out lines to uncomment. Where the prose already carries the point, no comment. A comment describes the line it sits on, unambiguously: it names nothing the reader hasn't met, and never pairs code with an outcome so that either could be read as the cause.
  - Before: `// Passed on: plus doesn't run`; `controller.abort() // pending throws: aborted`
  - After: `// Can't be worked out without the shipping cost, so gives null`; `// When it's time to cancel` above `controller.abort()`
  - Before: `// { $isBlank: null } returns null, and evaluate never runs` above `const withoutPolicy = …`; `// The parameters whose nulls this one replaces`
  - After: `// Replace a null in the named parameters with this parameter's value`
- **A result in a comment is marked `// =>`,** a reason added to it opens with "since", and one that doesn't fit beside its call goes on the next line, indented under it. A result longer than a few lines goes in a `json5` block of its own, after a one-line lead-in, since a long comment is hard to read.
  - After: `const sum = await fig.evaluate({ $plus: [1, 2] }) // => 3`; `fig.isEvaluable({ $flibble: 1 }) // => true, since an unknown operator is a static error`
  - Before: a nine-line `// =>` comment under `divide?.parameters.by`
  - After: the call alone in a `ts` block, "Here's what it returns for `divide`:", then the whole object in `json5`
- **One comment per key in a config example,** on the key it describes; a comment above several keys reads as covering them all.
- **An alternative setting goes in the snippet as a comment, where it would be written,** rather than in a sentence after it.
  - After: `// Pass { trace: true } here to trace every evaluation`, above `const fig = new FigTree()`
- **Show the structure.** Each named parameter goes on its own line. A parameter is shown by name before a shortcut hides it, with a comment marking the switch. A list-shaped thing gets at least two items. An example of a type shows every field, with custom ones marked. A list of cases starts with the plain one.
  - Before: all five iterators positional, straight after a sentence naming `input` and `each`
  - After: `map` with `input` and `each` named, then `// The same two parameters, by position: [input, each]` above the other four
  - Before: `['SELECT … = $1', '$data.categoryId']`
  - After: `['SELECT … = $1 AND unit_price < $2', '$data.categoryId', '$data.maxPrice']`
- **In host and operator code, show where each name comes from, and name it for what it does.** The import goes below the cut, and the prose says what kind of thing a new name is. The plain form comes before the variant, and a real call beats a made-up helper. A call that doesn't fit on a line puts each argument on its own line; where the example is about a parameter, use the named form.
  - Before: `operators: [coreOperators, httpOperators(new FetchClient()), shippingQuote]`, with `shippingQuote` declared out of sight
  - After: `import { formatNumber } from './operators/formatNumber'`, under `// A custom operator, written with defineOperator()`
  - Before: "or one you pass it, as `new FetchClient(myFetch)`"; `return pick(response, returnPath)`, with `pick` declared out of sight
  - After: "`new FetchClient()`. To use a different one, such as a `fetch` wrapped to retry failed requests, pass it in: `new FetchClient(fetchWithRetry)`"; `const { found, value } = resolvePath(response, returnPath)`, the exported function the core `http` uses
- **Operator code reads as it would in place,** with any wrapper it needs hidden by cut lines, and a comment wherever a line would look wrong, surprising or arbitrary, saying why.
  - Before: `condition ? then : otherwise`; `// Every element's sort value, all evaluated at once`
  - After: `return condition ? then : otherwise`; `// sort() can't await, so work out every element's sort value first`, and `// Every value is already running…` above a `for await` that reads as sequential

## Punctuation, formatting and links

- **No full stop on a one-sentence summary,** such as a page's frontmatter `description`.
- **A bullet's headline is bold and capitalised, with the colon inside the bold,** as in "**Passed on:**", or outside where the label is code alone: "**`map`**:". A bullet that's a sentence ends with a full stop; a short phrase doesn't, and nor does a bracketed note that isn't a sentence of its own, which starts lowercase.
  - Before: "**`'alias'`**: `+`, `$d`. An operator with no alias keeps its name."
  - After: "**`'alias'`**: e.g. `+`, `$d` (an operator with no alias keeps its name)"
- **A reference in prose takes no quotes.** Quotes only where the point is that it's a string.
  - Before: "a bare `'$data'` gives the whole data object"
  - Kept: "Any other string is plain text, even one starting with `$`, such as `'$5.00'`."
- **Where a list spells out a group just named, introduce it with a colon,** or brackets where the sentence already has one; after a comma, the group's name reads as one more item.
  - After: "every operator on the Operators page except the I/O ones: `http`, `graphQL` and `sql`"
- **A dash qualifies or demonstrates a statement; a colon introduces a list or examples.**
  - Before: "`getOperators()` and `getFragments()` need no subpath: they're methods on the instance"
  - After: "…need no subpath — they're methods on the FigTree instance"
- **An article follows how a word is said:** "an `SQLiteConnection`".
- **Link an API or concept at its first mention on the page, to the section rather than the page.** Where a phrase in the sentence names the thing, the link goes on it, in its own words. Otherwise a pointer in brackets uses the heading it lands on as its text, never a callout title or a paraphrase, and the section over a sub-section where both would do. A link to a whole page uses the page's name in the sidebar, so it doesn't look like it goes somewhere else.
  - Before: "the same checks as an eager parameter's ([What the engine does for you](…))"
  - After: "the [same checks](…) as an eager parameter's"
  - Before: "[Static analysis](/tooling/authoring/) covers reading the report.", where the sidebar lists the page as /authoring
  - After: "The [`/authoring`](/tooling/authoring/) page covers reading the report."
- **One name, one link,** so the comma or "and" between two names stays plain text.
  - After: "Like [`and`](…) and [`or`](…)"
- **A comment in a code block the page shows fits the block, about 70 columns,** breaking at a natural pause. The repo's 80-column limit wraps mid-phrase on the page. Code lines may wrap.
  - Before: `// FigTree's own comparison utility, as used by greaterThan and other core` / `// comparison operators`, which left "core" alone on a line
  - After: `// FigTree's own comparison utility, as used by greaterThan` / `// and other core comparison operators`

## Reference pages

The API reference pages are looked up rather than read in order, and follow the entry template in the `/write-page` skill. These rules are theirs alone; everything above applies to them too, except where a rule here says otherwise.

- **Reference pages use the correct technical term. Guide pages stay casual.**
  - Before: "Method", "nothing", "don't change an expression object"
  - After: "Member", `void`, "don't mutate an expression", since "change" also covers swapping one object for another; a guide page keeps "Don't change an expression in place"
- **A member's one-line description says what it does, not one use of it.**
  - Before: "Compiles an expression once, to evaluate it any number of times."
  - After: "Compiles an expression, ready to check or evaluate."
- **What a method returns about a thing is "data about" it, never the thing.**
  - Before: "The instance's registered operators and fragments, as plain data"
  - After: "Detailed data about the registered operators and fragments"
- **A boolean option's description says what `true` does:** "If set to `true`, a reference to a missing path fails…"
- **Spell out what something isn't, where that's the trap.**
  - After: "joins with the text `'$data.separator'`, not the value of the data reference"
- **A type's opener says what it is, in terms the reader already knows,** not only where it comes from, and leads with what bears on its main job.
  - Before: "A `CompiledExpression` is what `fig.compile()` returns: one expression, compiled by a FigTree instance…"
  - After: "…an expression that's been checked and built into a structure much like its canonical form, with each node mapped to its operator alongside its named parameters…"
- **Leave out what something is for, behaviour anyone would assume, and detail too small to matter in practice.** The guides cover the why, and stating the obvious plants a doubt.
  - Cut: "It's read by reference, never copied, and FigTree never changes it.", on `data`
  - Cut: "Each operator is set separately: a default on `equal` doesn't reach `notEqual`."
  - Cut: "The clock starts once the evaluation starts running, after the checks made before it runs.", since the checks take milliseconds against timeouts of seconds
- **Say once what's true of every entry, above them all. An entry that mirrors another links to it and lists only the differences, and a point repeated across bullets is folded into one.**
  - After: "Any error FigTree throws is a `FigTreeError`, even one that started inside a custom operator, so each entry here lists only the error codes.", below the summary table
  - After: "It works as `fig.evaluate()` does, with the same per-call options, return values and errors, but with the options, operators and fragments the expression was compiled with"
- **Explain a technical detail where the reader meets it.**
  - Before: a Constructor bullet on the class's type parameter, `FigTree<InstanceOpts>`
  - After: a clause in `evaluate()`'s TypeScript paragraph: "That's why an instance's type includes its options, as in `FigTree<{ trace: true }>`"
- **Show what makes each exception an exception.** Give one example of the rule, pair each exception with what the rule would have predicted, and link to the full list in the source.
  - After: "Each constant's name is its code in camel case, as in `ErrorCodes.typeCheck`, except for three: `graphQLErrors` (`'graphql-errors'`), `maxDepthExceeded` (`'max-depth'`) and `maxNodesExceeded` (`'max-nodes'`)."
- **Layout.** Every member gets a row in the summary table, the constructor and properties included, and every section is reachable from the opener or the table. Where a return type depends on an option, give one signature per shape, not a union. A signature that won't fit on a line is laid out as the source declares it. A warning in a Details list gets a bold "**Caution:**" label, not a callout. A note about what follows goes in an italic paragraph of its own just before it, not in a Details bullet.
