# Movie tickets

<img src="./img/movie-ticket_300.png" width="150"/>

This expression decides whether a filmgoer can see a film. The rule is that they must be old enough for the film's rating, or 13 or over with a parent.

Press **$if** at the top of the tree, then switch the left pane to **Trace**. The trace shows every part of the expression that ran, with the value it returned, so you can follow how the answer was reached:

- **The `$or`**: its two parts, one for each half of the rule, and which of them was `true`.
- **The `then` branch**: marked `skipped`, since `if` only evaluates the branch it returns.

Things to try:

- The filmgoer is 12, with a parent, so they're turned away. Change `age` to 13, and the second half of the rule lets them in.
- Change `age` to 18, and the first half does.

After each change, press **$if** again to see the new trace.
