# Hello, FigTree

A **FigTree expression** can be any JSON value. This one is a plain object, a profile card for a user, and most of it is kept just as it's written. The objects with a key prefixed with `$`, such as `{ $buildString: … }`, are **nodes**: each one runs an operator when the expression is evaluated, and is replaced by its result.

Strings such as `$data.user.country` are **references**, which read from the data on the left, and a `//` key is a comment, which is ignored.

Press **Evaluate** at the top of the tree to evaluate the whole card, or a node's own button, such as **$buildString**, to evaluate just that node.

Things to try:

- Delete `nickname` from the data, and `callMe` falls back to the first name.
- Misspell a path in the expression, such as `$data.user.contry`. A path that doesn't exist quietly reads as `null`.
- Misspell an operator, such as `$buildStrng`. That's caught before anything runs, with a suggestion of what you meant.

Every node here is written in _shorthand_. To see one with all its parameters named, hover over it and press **To canonical**, at its top right.
