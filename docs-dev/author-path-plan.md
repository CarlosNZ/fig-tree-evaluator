# An author's path through the docs site

Working decisions on how the docs site serves expression authors, from the review of "Splitting the main path by audience" in [doc-planning.md](doc-planning.md). Started November 2026. When it's settled, that section is reduced to the outcome and a link here.

## Decided

### No chapter split

The proposal to split Concepts and Guides into an author chapter and a host chapter is rejected. Instead, the chapters and their order stay as they are, one new page gives authors their path, and the mixed pages put their author material first.

Why:

- **The line between author and host runs through features, not pages.** Nearly every feature has a side the host provides and a side the author uses: the app passes the data and the author reads it, the app chooses the operators and the author calls them, the app registers fragments and the author calls them (and may write their bodies), the app provides a way to run `validate()` (an editor, a save hook, CI) and the author reads the static errors, and the app sets a `timeout` and the author's fallbacks decide whether the expression is shielded from it. A chapter split cuts each of these in two.
- **It would break up the build-up.** Someone reading front to back, usually a developer who is both host and author, would meet each split feature twice, in two chapters.
- **It would add duplication.** Each half of a split page needs text explaining the other half, on top of the overlap the site already has.

The current Concepts and Guides line is already close to the author and host line, which is why the remaining fixes are small: all six Concepts pages are mostly author material, and of the seven Guides pages, four are host-only and three are mixed (Fallbacks, Fragments, HTTP and SQL).

### The Getting started page

One new page that orients both audiences and points each to the pages that teach, with no rules restated and no code blocks. It absorbs "What your app decides" from the proposal. Drafted with the full outline (static errors, surprises in the data, traps) and pruned in Carl's edit pass to three sections, since the pages it links to already make those points:

1. **The opening:** start with Concepts (said twice, on purpose), and the two different but overlapping audiences: expression authors, whoever configures the system, and developers, who implement FigTree in an app and provide the tools expression authors work with.
2. **What your app decides:** a concrete case (a rule for when a form field shows up), then the decisions: which operators exist, what `$data` holds and whether a missing value is an error, which fragments you can call (and whether you can create your own), operator defaults, limits, and how your work gets checked.
3. **Writing an expression:** Concepts in order, then Fragments, Checking expressions, Fallbacks and errors, Missing values, Syntax at a glance and the operator reference.
4. **If you're the developer:** "What your app decides" is theirs to implement, then their pages after Concepts: Guides, Custom operators, the API reference, Beyond evaluation, and the visual editor component (named as a React component, so the reader knows it's for them).

Its wording avoids terms the reader hasn't met yet where the reader's goal says the same thing, such as `/authoring` showing "where fallbacks should be applied" rather than which failures are uncovered.

**Getting started** is its title. It's a one-page chapter, first in the sidebar, at `/getting-started/`, and the home page's "Get started" button leads to it. It orients rather than summarises, so it can come before the pages that teach, and its next link goes on to Expressions and nodes.

### "Expression author"

The site's term for the first audience is **expression author**, always in full, never "author" alone; the second is **developer**. "Expression" names the very thing FigTree evaluates, where "configuration" is one step removed. The `./authoring` subpath sits in the middle: its analyses are for expression authors, through tools a developer builds into the app, and Getting started says so where it covers how an expression author's work gets checked.

### Getting started is written first

Getting started is written before anything else here is decided, since how it turns out shapes the rest: which sections it links to, and so what each mixed page needs to put first.

### Concepts is the expression author's walkthrough

The Concepts chapter, read in order, already walks an expression author through the language, so its order stays as it is and Getting started points to it as a whole rather than page by page. How evaluation works stays second: Variables and Iteration build on it (lazy evaluation, truthiness, `and` and `or` stopping early), so moving it later would turn those back-references into forward ones. Its developer material is small and at the ends of sections: the `await fig.evaluate()` block and the synchronous-evaluator callout, the compile-cache sentence, and the closing pointer to `operatorDefaults`. Shorthand and canonical forms is similar, with "Converting" last.

The one real exception is Data references, which opens with developer material. **To do after Getting started:** move the detail in "The data object" (instance data against per-call data, its two `ts` blocks and the "Per-call data replaces instance data" callout) to Setting up FigTree's "Options for a single evaluation", leaving a sentence or two and a link.

## Open, after Getting started

1. **Author material first on the mixed pages:** what moves down each page, and whether host sections get a marker. See "How the pages divide" below. A first proposal, for reference: on Fallbacks and errors, move "Instance-wide fallbacks" down to just before "Errors that reach the host"; reorder Fragments as calling, then what a body sees and failures, then writing a fragment, then registering (which needs `<FragmentSetup>` to show a definition as a plain JSON5 object as well); reorder HTTP and SQL as requests and queries, failures, the node's `timeout` and caching, then the developer's sections.
2. **The no-TypeScript rule:** whether it applies to Getting started only, and whether it's a convention or something the build checks.
3. **Fit with the pages still to be written or edited.**

## Follow-ups

- **The term, site-wide:** "configuration author" appears 15 times across 9 pages (Syntax at a glance, Setting up FigTree, the three Under the hood pages, the editor page, and three Custom operators pages), and "the author" alone a few times. Each becomes "expression author", and so does the voice guide's "Fixed terms" entry, which says "configuration authors".
- **The `/authoring` page's intro:** one line saying it's for developers building tools for expression authors.
- **The home page:** "Get started" links to `/getting-started/` rather than `/concepts/expressions/`.
- **doc-planning.md:** Getting started joins "Site chapters", and the "Splitting the main path by audience" section is reduced to the outcome and a link here.

## How the pages divide

Re-checked against v3.0-docs at 9c4b399, replacing the list in doc-planning.md, which was written against 809efb0.

- **Author-only:** Expressions and nodes, Variables, Iteration, the operator reference.
- **Mostly author, with host parts:**
  - **Data references** opens with host code: "The data object" (instance data against per-call data, a `ts` block, and the "Per-call data replaces instance data" callout with another). The `strictDataPaths` and `with()` blocks in "When missing is a mistake" are host code too, though the problem they solve (a misspelt path is a silent `null`) is the author's.
  - **How evaluation works:** the difference between static and runtime errors in "Compiled first, then run" is author material, and the page's later sections build on it. Only the sentence about the compile cache is host material, and the stages themselves are covered in Compile, check, evaluate. In "Recursive and async", siblings running in parallel matters to authors; the `await` block and the synchronous-evaluator callout are host material.
  - **Shorthand and canonical forms:** "Converting" (the `./format` functions) is host or tool-builder material, as are the intro's "useful when" bullets.
  - **Syntax at a glance:** "A whole config" ends in two `ts` blocks (`fig.validate()` and `fig.with({ timeout })`), and the last three rows of "Null or failure" are host settings. Its two link tables point at `guides/` anchors.
- **Mixed:**
  - **Fallbacks and errors:** author material up to and including timeout shielding, since whether an expression is shielded is decided by its fallbacks alone (though the shielding example is a `ts` block). "Instance-wide fallbacks" and "Errors that reach the host" are host material.
  - **Fragments:** puts the host material first. "Defining and registering" follows the intro, and its `<FragmentSetup>` registration block appears again in "Fragments vs variables" and "When a fragment fails". Most of a definition is data an author could write (the body, parameter declarations, `$params`, what the body can see); only registering (`new FigTree`, `updateOptions`), `listing` and `metadata`, and the `validate(…, { params })` call are code.
  - **HTTP and SQL:** author material is spread through host sections. Relative URLs and `headers: { Authorization: null }` sit in "Base endpoints and shared headers"; the node's own `timeout` shares "Timeouts and cancellation" with the pg and axios driver timeouts; "Caching responses" and "When a request fails" are author material; the `forecast.ts` and `public.ts` blocks are expressions written as `ts`.
  - **Checking expressions:** "Static errors" catalogues the mistakes an author can make, and several pages send authors there; the `validate()` calls around it are host code.
  - **Caching and compiling:** `noCache` is a reserved key authors write, shown in "Turning caching off"; the rest is host material.
- **Host-only:** Setting up FigTree, Tracing and debugging, the API reference.
