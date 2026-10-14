# Docs voice guide

How the v3 docs site is written, distilled from Carl's rewrites of drafted pages. Each entry is a rule and an example taken from a real edit. It grows a page at a time, through stage 4 of the `/write-page` skill ([.claude/skills/write-page/SKILL.md](../.claude/skills/write-page/SKILL.md)).

Entries are revised rather than duplicated when a later edit refines or contradicts them.

## Rules

- **Say "a key prefixed with `$`" (or "`$`-prefixed key"), never "`$` key".** The short form leans on a term the reader has to remember from earlier; the long one describes the key wherever it appears.
  - Before: "An object in an expression with a `$` key is read as a node."
  - After: "An object in an expression that has a key prefixed with `$` is read as a node."
