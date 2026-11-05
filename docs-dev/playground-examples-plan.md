# Playground examples: a proposed set

A proposal for a new set of examples for the Playground page ("The Playground page" in [doc-planning.md](doc-planning.md)), written November 2026. The current set, in [docs-site/src/playground/](../docs-site/src/playground/), came across from the v2 demo with only its syntax updated, and several of them (Variables, Fragments, Custom Operators) don't show those features at their best. The set is for visitors new to FigTree, most of whom will never have seen v2, so its job is to show what the library can do, not what changed since v2. Nothing here is decided yet: it's ideas in natural language, with no expression code.

## What the set should do

The set should show a new visitor what FigTree can do, and it should hang together:

- **Each example has one main feature.** Others can appear alongside it, but the blurb is about that one.
- **The reader is always told what to try.** The docs pages do this with comments in the data, like "Change `itemCount` to 3". The Playground should do the same.
- **Each expression fits on a screen or two** once its tree is collapsed to its starting level.
- **The widget's existing action buttons get used.** Show trace, Show coverage and Clear cache already work on the docs pages, and they show things a result alone can't: how the expression ran, where it's protected from failure, and what's cached. The Playground has its own editors rather than the widget, though: coverage shows as its badge and Clear cache is in its Configuration panel, and Show trace is the Playground's Trace view, which an example turns on with `trace: true` ("The Playground page" in [doc-planning.md](doc-planning.md)).

## The examples

Ordered roughly from simplest to most advanced:

1. **Hello, FigTree** (reworks _Basics_). The expression is a small profile card: a plain object with some fixed values and some nodes, such as a display name built from `{{$data…}}` tokens, an `isAdult` check, and a nickname falling back to the first name with `firstNonNull`. It shows that any JSON value is an expression, along with references, shorthand and comments. Things to try:
   - Remove the nickname.
   - Misspell a data path, which quietly gives `null`.
   - Misspell an operator, which is caught before anything runs, with a "did you mean".

2. **Movie tickets** (_Conditional logic_, kept). The rule stays as it is. Turn on the **Trace** view (`trace: true`), so the reader can see which side of the `or` decided the answer and that the rest was skipped. That makes lazy evaluation visible, with no explanation needed. The data comments suggest an age of 12 with a parent, then 13 with a parent.

3. **A form, configured** (new; replaces _City list_). A small form definition where `visible`, `required` and `options` are expressions. The city options come from the countriesnow lookup on the chosen country, with a `[]` fallback. A licence field appears only for drivers aged 16 or over, and the postcode is required only in some countries. This is FigTree's main use case ("logic in places that can only hold data") at full size, and the existing form screenshot and the JSON Forms demo link carry over.

4. **Group ferry booking** (new: iteration and vars). A list of passengers with ages is mapped to fare types (adult, child, senior or infant) using a fare table. Each passenger gets a line, numbered with `$index`. A family discount applies when the group has at least two adults and a child (`filter` plus `length`), and the total uses `[*]` over the lines. Things to try: add or remove passengers, change ages, or set one age to `'unknown'` and watch that passenger's own fallback handle it.

5. **Card game recommender** (reworks _Decision tree_). The rules move into the data: a list of games, each with player counts, a minimum age and a difficulty. `filter` (with `as: 'game'`) returns every suitable game and `find` returns the best one. The blurb can make the point that as a nested tree of `if`s, the same rules run to 60 lines and a new game means a new branch, while here it's one line of data. It keeps the cards image.

6. **What to wear today** (new: vars; replaces _Star Wars_). Two variables chain together:
   - `place` geocodes a city name with Open-Meteo's geocoding API.
   - `forecast` reads `$vars.place.latitude` to fetch that city's forecast.

   The result reads `forecast` in several places (a summary, "take an umbrella?", "jacket?"), but only one request is sent. Two more things to try: leave the city blank and no request is sent at all (watch the network tab), and an unknown city gets a fallback. It shows vars reading other vars, a value evaluated once and lazily, and request results reused, without the 80-entry character map.

7. **Resilient dashboard** (new: fallbacks and `$error`). Three panels for a JSONPlaceholder user: profile, post count and task completion %. Each panel has its own fallback, and the profile's fallback branches on `$error.code`. Changing `userId` to 999 makes each panel respond differently:
   - The profile gets a 404 and shows "No such user".
   - The post count gets an empty list, which isn't a failure, so it shows 0.
   - The completion % divides by zero, giving `non-finite-result`, and shows "No tasks yet".

   Add **Show coverage**: delete a fallback and that failure point shows up as uncovered.

8. **Product search** (new: SQL, run in the browser on SQLite). A Northwind query joins products and suppliers, with the search term bound into a `LIKE` and a maximum price. The rows are mapped to lines like "Chai: $18, 39 in stock (Exotic Liquids, UK)", with low or out-of-stock flags. A `firstValue` count gives a heading. One fun thing to try: type `'; DROP TABLE products; --` into the search. It's bound as a value, so nothing happens, which illustrates the sandbox.

9. **Your app's vocabulary** (reworks _Fragments_). An order-confirmation message is built from small fragments: `greeting` (already the fragment editor's starting sample), `plural` ("1 item" or "3 items") and `money`. `orderLine` calls the other fragments, showing that fragments can be nested. It shows:
   - parameters with defaults
   - calls checked like operator calls (misspell `amount` and it's caught before running)
   - listings appearing in the editor's menu

   One fragment could hide a GraphQL request (country details from the trevorblades API), which would give the set its only GraphQL example. It also suits the fragment editor once that's ported: change `money` to put the currency after the number, and every call follows.

10. **Dates, your way** (reworks _Custom operators_). Dates are the gap a host is most likely to fill. A subscription notice ("Your Pro plan renews on Saturday 14 November, in 10 days" / "expired 3 days ago") uses two custom operators, `daysUntil` and `formatDate` (`style: 'short' | 'long' | 'weekday'`). Both stages of FigTree's error handling appear in one example:
    - `style: 'loong'`, or an impossible fixed date caught by a `validate` hook, is a static error.
    - A bad date from the data is a runtime failure, which a fallback catches.

    The blurb shows the definitions. `changeCase` should go, since the core operators include `upper` and `lower`. One problem: a fixed sample date drifts into the past. Either give `daysUntil` an optional `from` date and put both dates in the data, or use a data comment ("pick a date next week").

11. **Complex string substitution** (kept). One improvement: replace the two gender `match`es with a single variable holding a pronoun object, keyed by a `pronouns` field ('she', 'he' or 'they'). The template then reads `{{$vars.they.lives}}`, which shows that tokens read paths into a variable's value.

12. **Random user** (kept, now about caching). Drop `noCache` and add **Clear cache**:
    - Evaluating again gives the same person, because the response is cached.
    - Clearing the cache gives a new person.
    - Adding `noCache: true` gives a new person every time.

### Possible extras

If the set can grow:

- **Tidying form input:** `regex` replace and extract, `trim`, `lower` and `convert`, with a list of problems built by `filter` over validation rules.
- **Feature-flag targeting:** a flags config with percentage rollout via `modulo` on the user id, a beta list via `some`, and the plan via `match`.
- **Spot the mistakes:** an expression with four static errors (an unknown operator, a misspelt parameter, a `$vars` typo, and `$element` used after `as`), which the reader fixes one by one. Unusual for a playground, but nothing else shows as clearly that FigTree checks an expression before it runs.

## Changes the set needs

- **An `action` field on `PlaygroundExample`.** Examples 2, 7 and 12 need one. The widget already supports actions; the example type doesn't have the field.
- **Data as JSON5 text.** The "try this" comments need it, but `data` is currently a JS object, which can't hold comments. The demo reads the same files, so it would need to parse JSON5 as well.
- **A new Playground set in `fragments.ts` and `operators.ts`.** It keeps the ruling that the docs pages' own fragments and operators stay out of the Playground's set.
- **External APIs:** countriesnow, randomuser.me, JSONPlaceholder and, if kept in example 9, trevorblades. Open-Meteo is new, and whether it allows browser requests (CORS) is still to be checked. The flaky SWAPI mirror goes. Playground requests are always real, with no recordings to fall back on, so fewer APIs means fewer things that can break.

## Open questions

1. **Twelve examples, or fewer?** To stay near the current nine, _Random user_ could fold into the dashboard as a caching note, and _Hello_ could give way to the form example.
2. **Should _Spot the mistakes_ be in?** It's the one example that starts out broken on purpose.
