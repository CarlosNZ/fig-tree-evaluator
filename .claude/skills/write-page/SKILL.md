---
name: write-page
description: Write or flesh out one page of the v3 docs site (docs-site/src/content/docs/) with Carl, in six stages — skeleton and facts agreed in chat, Carl writes the intro, Claude drafts the body and tidies it, Carl leads a paragraph-by-paragraph edit pass, then his rewrites are distilled into the voice guide. Use when Carl asks to write, draft or flesh out a docs-site page.
argument-hint: <page, e.g. concepts/expressions>
---

# Writing a docs-site page

Each page is written in six stages, and each stage ends by waiting for Carl. The aim is a page in Carl's voice: he writes the framing prose, Claude writes the mechanics around it, and every page's edits make the next draft closer.

The page is `docs-site/src/content/docs/$ARGUMENTS.mdx`. If no page was given, or it's ambiguous, ask which one.

## Before starting

Read:

- the page as it stands (most are skeletons whose headings note what they'll cover)
- its neighbours in sidebar order (`sidebar.order` frontmatter, sections ordered in `docs-site/astro.config.mjs`), so the page doesn't repeat them and links where they take over
- [docs-dev/docs-voice.md](../../../docs-dev/docs-voice.md), the voice guide built up from earlier pages
- "Writing the pages" and "Examples" in [docs-dev/doc-planning.md](../../../docs-dev/doc-planning.md)
- the components available for examples, in [docs-site/README.md](../../../docs-site/README.md) ("Layout") and the Prototype page (`docs-site/src/content/docs/prototype.mdx`)

## Stage 1: skeleton and facts, in chat

Propose, in chat, without touching the file:

- **The sections**, in order. For each one, the single point it makes, in a sentence.
- **The examples.** For each section, what goes there and why: a static expression block (`<Expression>`, the default), a live `<Playground>` (only where interacting teaches something), a diagram, or a host-code `ts` block. Say what each example shows, sketching the expression where it helps.
- **The intro passages**: which passages are framing prose for Carl to write. Always the page's opening; usually the opening of any section that introduces an idea, as opposed to describing a mechanism.
- **The facts the page must get right**, each with its source. Take them from the specs in `docs-dev/v3-specs/`, then check each against the code wherever a ruling may have moved, since the code has the final say. Expression results need no check: the build evaluates them.
- **Anything left out** that a reader might expect here, and where it lives instead.

Keep it to roughly a screen. Wait for Carl to agree or change it.

## Stage 2: Carl's intro

Ask Carl for the intro passages agreed in stage 1. Rough is fine; they set the tone the body follows.

If he'd rather react than start blank, write a short stand-in, clearly marked in the file (`{/* STAND-IN: Carl to rewrite */}` above it), and say that his version takes precedence. Wait for his text before drafting the body.

## Stage 3: the body

Write the page around Carl's text:

- Leave his passages as he wrote them. If one has a factual problem or doesn't fit the agreed structure, raise it in chat rather than editing it.
- Match his tone and the voice guide. Keep prose close to the examples it explains, so there's less of it to rewrite.
- Never hard-wrap paragraphs in the MDX.
- Run the docs build from `docs-site/` (`pnpm build`) and fix whatever it fails on: examples that throw, snippets that don't compile. If the library's `src/` has changed since its last build, run `pnpm build` at the repo root first.
- Save a copy of the finished draft to the scratchpad as `<page-slug>.draft.mdx`. Stage 6 diffs against it.

Hand it over with a short summary: what's on the page, anything that departed from the stage 1 skeleton and why, and any open questions.

## Stage 4: tidy

Once Carl has rewritten the passages he wants to (he may edit the file directly; take what's on disk as current), read the whole page for repetition and flow:

- Cut what an earlier passage already says, including near-repeats between his text and the body. A point stated twice usually belongs where it's first needed, and is cut from the other place.
- Check the order still builds, each section on the one before, and that terms are introduced before they're used.
- Leave his passages alone apart from cutting a repeat; raise anything else in chat.

Hand it over with a short list of what changed and why, and any slip spotted in his text (a typo, a missing word) for him to fix.

## Stage 5: Carl's edit pass

Carl leads a paragraph-by-paragraph pass. He selects a passage (usually through an IDE selection) and gives feedback; Claude replies with a suggested version and applies it only once he approves. Don't walk through the page leading with notes on each paragraph.

- Check each suggestion against the facts from stage 1 and the code, and say so briefly when his wording would make a statement inaccurate, with a version that fixes it.
- Keep replies short: the suggested passage, plus a sentence on anything that needs his decision.
- Changes he asks for to components or site styles happen here too. Commit when he asks, keeping the page and the site changes in separate commits.

The pass ends when Carl says the page is done.

## Stage 6: learn from Carl's rewrite

When the page is done, diff the final version against the saved draft. If the draft copy is gone (a new session), use git history if the draft was committed, or ask Carl which parts he changed.

From the diff, propose additions to `docs-dev/docs-voice.md` in chat:

- Only patterns that generalise past this page: phrasings he swaps out, how much he explains, how he addresses the reader, sentence length, what he cuts. Skip one-off content fixes.
- Each one as a rule plus a short before → after pair taken from the diff.
- Note when an edit confirms or contradicts an existing entry, and propose revising that entry rather than adding a near-duplicate.

Write them to the voice guide once Carl agrees.
