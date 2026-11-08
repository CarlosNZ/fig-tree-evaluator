# Your app's vocabulary

**Fragments** are pieces of expression registered with FigTree under a name, and called just like operators. An app can build up a vocabulary of them, so expression authors write `$money` rather than the logic behind it every time.

This order confirmation uses five, which the Playground registers:

- **`greeting`:** "Hi, Ana!", or "Good day, Ana!" with `formal: true`. `formal` has a default, `false`, so a call can leave it out.
- **`plural`:** "1 item" or "3 items".
- **`money`:** an amount, with its currency symbol.
- **`orderLine`:** one line of the order, which calls `money` itself. A fragment can call other fragments.
- **`destination`:** a country's name and flag, from its two-letter code, looked up with a [GraphQL API](https://countries.trevorblades.com/).

A fragment call is checked before anything runs, like an operator's, and the fragments are listed in the editor's menu of operators, with their descriptions.

Things to try:

- Misspell `amount` in the `$money` call, and the editor flags it.
- Add `formal: true` to the `$greeting` call.
- Change `shipTo` to another country's code, such as `'FR'`.
- Press **Fragments**, at the bottom of the page, to edit the fragments themselves. Change `money`'s default `symbol` to `'£'`, save it, and every amount in the message follows.
