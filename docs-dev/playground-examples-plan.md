# Playground examples: a proposed set

A proposal for a new set of examples for the Playground page ("The Playground page" in [doc-planning.md](doc-planning.md)), written November 2026. The current set, in [docs-site/src/playground/](../docs-site/src/playground/), came across from the v2 demo with only its syntax updated, and several of them (Variables, Fragments, Custom Operators) don't show those features at their best. The set is for visitors new to FigTree, most of whom will never have seen v2, so its job is to show what the library can do, not what changed since v2. Nothing here is decided yet: it's ideas in natural language, with no expression code.

## What the set should do

The set should show a new visitor what FigTree can do, and it should hang together:

- **Each example has one main feature.** Others can appear alongside it, but the blurb is about that one.
- **The reader is always told what to try.** The docs pages do this with comments in the data, like "Change `itemCount` to 3". The Playground's panes are trees, which can't hold JSON5 comments, so there the list of things to try goes in the blurb, which opens on an example's first visit and again from Info. Where it helps, a short `//` comment in the expression marks the node to change: the editor shows it as a note. (A `//` key in the data would only be an ordinary property.)
- **Each expression fits on a screen or two** once its tree is collapsed to its starting level.
- **The widget's existing action buttons get used.** Show trace, Show coverage and Clear cache already work on the docs pages, and they show things a result alone can't: how the expression ran, where it's protected from failure, and what's cached. The Playground has its own editors rather than the widget, though: Show trace is its Trace view, which an example turns on with `trace: true`; coverage is its badge, which becomes a Configuration setting that an example turns on with `coverage: true` (below); and Clear cache is in its Configuration panel, beside a "Use the cache" switch and a count of what's cached ("The Playground page" in [doc-planning.md](doc-planning.md)).
- **The coverage badge is off unless an example needs it.** The analysis treats data as untrusted, so nearly any expression that reads `$data` has uncovered failures: a profile like example 1's shows "2 uncovered" (`plus` and `greaterThanOrEqual` may receive values their constraints refuse), as does Movie tickets. Shown to a first-time reader, that's noise with no explanation. An example that's about coverage turns it on and explains it.

## The examples

Ordered roughly from simplest to most advanced:

1. **Hello, FigTree** (reworks _Basics_). The expression is a small profile card: a plain object with some fixed values and some nodes, such as a display name built from `{{$data…}}` tokens, an `isAdult` check, and a nickname falling back to the first name with `firstNonNull`. It shows that any JSON value is an expression, along with references, shorthand and comments. Things to try:
   - Remove the nickname.
   - Misspell a data path, which quietly gives `null`.
   - Misspell an operator, which is caught before anything runs, with a "did you mean".

   **Built** (November 2026, id `hello`), in place of _Basics_.

2. **A form, configured** (new; replaces _City list_). A small form definition where `visible`, `required` and `options` are expressions. The city options come from the countriesnow lookup on the chosen country, with a `[]` fallback. A licence field appears only for drivers aged 16 or over, and the postcode is required only in some countries. This is FigTree's main use case ("logic in places that can only hold data") at full size, and the existing form screenshot and the JSON Forms demo link carry over.

   **Built** (November 2026, id `form`). The lookup uses countriesnow's GET form (`…/cities/q?country=`), since its POST endpoints answer with a 301 to it. The starting country is Tonga, whose eight cities make a short list, and which has no postcodes. The left pane opens on a live **Form** view (`preview: 'form'` on `PlaygroundExample`, `FormPreview.tsx`): the result drawn as the form it configures, evaluated again after each edit of the expression or the data, and filling it in edits the data. A field can carry a `comment`, which the form shows under its label: the three rule fields use it to say what their rule does, so the form is described wholly by the expression. The note above the form, saying what it is, is the Playground's own. No other example has one: their results are already in display form, and the dashboard, the nearest case, shows its fallbacks well enough as JSON.

3. **Movie tickets** (_Conditional logic_, kept). The rule stays as it is. Turn on the **Trace** view (`trace: true`), so the reader can see which side of the `or` decided the answer. The things to try are an age of 13 with a parent, then 18.

   **Built** (November 2026, id `movie-tickets`). `and` and `or` race their elements, all starting at once, so with only references in them, every element shows in the trace with its value. What's visibly skipped is the `if` branch not taken, and the blurb points at that instead.

4. **Group ferry booking** (new: iteration and vars). A list of passengers with ages is mapped to fare types (adult, child, senior or infant) using a fare table. Each passenger gets a line, numbered with `$index`. A family discount applies when the group has at least two adults and a child (`filter` plus `length`), and the total uses `[*]` over the lines. Things to try: add or remove passengers, change ages, or set one age to `'unknown'` and watch that passenger's own fallback handle it.

   **Built** (November 2026, id `ferry`). The passengers are named with `as: 'passenger'`, so the lines are numbered from `$passengerIndex`. The discount counts adults with `filter` and `length`, and checks for a child with `some`. An age that isn't a number falls back to the adult fare. The data pane starts three levels open (`dataCollapse`, new on `PlaygroundExample`), so the ages show.

5. **Card game recommender** (reworks _Decision tree_). The rules move into the data: a list of games, each with player counts, a minimum age and a difficulty. `filter` (with `as: 'game'`) returns every suitable game and `find` returns the best one. The blurb can make the point that as a nested tree of `if`s, the same rules run to 60 lines and a new game means a new branch, while here it's one line of data. It keeps the cards image.

   **Built** (November 2026, id `card-games`). The recommendation is the first suitable game at the preferred difficulty, else the first suitable game, else "No game fits, sorry".

6. **What to wear today** (new: vars; replaces _Star Wars_). Two variables chain together:
   - `place` geocodes a city name with Open-Meteo's geocoding API.
   - `forecast` reads `$vars.place.latitude` to fetch that city's forecast.

   The result reads `forecast` in several places (a summary, "take an umbrella?", "jacket?"), but only one request is sent. Two more things to try: leave the city blank and no request is sent at all (watch the network tab), and an unknown city gets a fallback. It shows vars reading other vars, a value evaluated once and lazily, and request results reused, without the 80-entry character map.

   **Built** (November 2026, id `weather`). The geocoder answers an unknown city with no results rather than a failure, so an inner `$if` on `$vars.place` handles it, and the fallback covers a failed request. Its things to try use `'Qwertyville'`, since Narnia is a real town in Bangladesh.

7. **Resilient dashboard** (new: fallbacks and `$error`). Three panels for a JSONPlaceholder user: profile, post count and task completion %. Each panel has its own fallback, and the profile's fallback branches on `$error.code`. Changing `userId` to 999 makes each panel respond differently:
   - The profile gets a 404 and shows "No such user".
   - The post count gets an empty list, which isn't a failure, so it shows 0.
   - The completion % divides by zero, giving `non-finite-result`, and shows "No tasks yet".

   It turns on the **coverage badge** (`coverage: true`), and starts out "Fully covered": each panel's fallback wraps the whole panel, so it catches the type-check findings from the data as well as the failures above. Delete a fallback and that panel's failure points show up as uncovered.

   **Built** (November 2026, id `dashboard`). The profile's fallback branches on `$error.errorData.status` (404), and the tasks panel's on `$error.code`. It starts "Fully covered".

8. **Product search** (new: SQL, run in the browser on SQLite). A Northwind query joins products and suppliers, with the search term bound into a `LIKE` and a maximum price. The rows are mapped to lines like "Chai: $18, 39 in stock (Exotic Liquids, UK)", with low or out-of-stock flags. A `firstValue` count gives a heading. One fun thing to try: type `'; DROP TABLE products; --` into the search. It's bound as a value, so nothing happens, which illustrates the sandbox.

   **Built** (November 2026, id `product-search`). The `firstValue` count is of every product matching the term, so the heading reads 5 of the 12 products matching "on" cost $15 or less. Prices are formatted by SQLite's `printf`. The starting search, "on" up to $15, shows all three stock states.

9. **Your app's vocabulary** (reworks _Fragments_). An order-confirmation message is built from small fragments: `greeting` (already the fragment editor's starting sample), `plural` ("1 item" or "3 items") and `money`. `orderLine` calls the other fragments, showing that fragments can be nested. It shows:
   - parameters with defaults
   - calls checked like operator calls (misspell `amount` and it's caught before running)
   - listings appearing in the editor's menu

   One fragment could hide a GraphQL request (country details from the trevorblades API), which would give the set its only GraphQL example. It also suits the fragment editor (the footer's Fragments): change `money` to put the currency after the number, and every call follows. `greeting` is also the name of the fragment editor's starting sample (`initialFragmentName`, not registered), so check the editor opens sensibly once the example has registered one of that name.

   **Built** (November 2026, id `fragments`). Five fragments, `destination` among them, with the GraphQL lookup. They're the Playground's default fragments (`fragments.ts`), in place of `getCapital` and `getFlag`. `money` puts a symbol before the amount, so the fragment-editor try is changing its default `symbol`.

10. **Dates, your way** (reworks _Custom operators_). Dates are the gap a host is most likely to fill. A subscription notice ("Your Pro plan renews on Saturday 14 November, in 10 days" / "expired 3 days ago") uses two custom operators, `daysUntil` and `formatDate` (`style: 'short' | 'long' | 'weekday'`). Both stages of FigTree's error handling appear in one example:
    - `style: 'loong'`, or an impossible fixed date caught by a `validate` hook, is a static error.
    - A bad date from the data is a runtime failure, which a fallback catches.

    The blurb shows the definitions. `changeCase` should go, since the core operators include `upper` and `lower`. One problem: a fixed sample date drifts into the past. Either give `daysUntil` an optional `from` date and put both dates in the data, or use a data comment ("pick a date next week").

    **Built** (November 2026, id `dates`). `daysUntil` takes an optional `from`, and the data holds both dates. The blurb's `formatDate` snippet is marked `nocheck`, since the site type-checks every `ts` block with twoslash.

11. **Complex string substitution** (kept). One improvement: replace the two gender `match`es with a single variable holding a pronoun object, keyed by a `pronouns` field ('she', 'he' or 'they'). The template then reads `{{$vars.they.lives}}`, which shows that tokens read paths into a variable's value.

    **Built** (November 2026). The variable is `pronoun`, a `$match` on `pronouns`, read as `{{$vars.pronoun.lives}}`. The capital lookup uses countriesnow's GET form.

12. **Random user** (kept, now about caching). Drop `noCache`, and point the reader to the Configuration panel's Cache section:
    - Evaluating again gives the same person, because the response is cached.
    - Clear cache gives a new person.
    - Adding `noCache: true`, or unticking "Use the cache", gives a new person every time.

    It sets `options: { operatorDefaults: null }`. An "open in editor" link's `noCache` flag becomes operator defaults, and they stay after it, so without the reset the cache could already be off.

    **Built** (November 2026), as planned.

### Possible extras

If the set can grow:

- **Tidying form input:** `regex` replace and extract, `trim`, `lower` and `convert`, with a list of problems built by `filter` over validation rules.
- **Feature-flag targeting:** a flags config with percentage rollout via `modulo` on the user id, a beta list via `some`, and the plan via `match`.
- **Spot the mistakes:** an expression with four static errors (an unknown operator, a misspelt parameter, a `$vars` typo, and `$element` used after `as`), which the reader fixes one by one. Unusual for a playground, but nothing else shows as clearly that FigTree checks an expression before it runs.

## Changes the set needs

- **The coverage badge as a Configuration setting.** A switch in the panel, beside the coverage analysis's Strict numbers, off by default. An example turns it on with `coverage: true` on `PlaygroundExample`, as `trace: true` does the Trace view, and so does an "open in editor" link from a docs example whose action is Show coverage, with the configuration toast saying so. It's not a FigTree option, but the panel already holds Playground settings that aren't.
- **Trace and the coverage badge follow the examples, unless the reader turns them on.** Untouched, each is on for an example or link that asks for it and off for the rest. Turning one on pins it on for every example; turning it off goes back to following the examples. Each switch has two values: `pinned`, kept in local storage, set only by the reader, and `fromExample`, in memory only, set afresh each time an example or link opens. It shows as on when either is set; turning it on sets `pinned`, and turning it off clears both, so it can be turned off on an example that asks for it. While it's on only for the example, the panel says so ("On for this example"). On a reload the open example is set up again, so a switch turned off on an example that asks for it comes back on.
- **A new Playground set in `fragments.ts` and `operators.ts`.** It keeps the ruling that the docs pages' own fragments and operators stay out of the Playground's set.
- **External APIs:** countriesnow, randomuser.me, JSONPlaceholder and, if kept in example 9, trevorblades. Open-Meteo is new; its geocoding and forecast APIs both allow browser requests (`access-control-allow-origin: *`, checked November 2026). The flaky SWAPI mirror goes. Playground requests are always real, with no recordings to fall back on, so fewer APIs means fewer things that can break.

## Open questions

1. **Twelve examples, or fewer?** To stay near the current nine, _Random user_ could fold into the dashboard as a caching note, and _Hello_ could give way to the form example. Against the latter: on a first visit the first example's blurb follows the welcome, which suits _Hello_.
2. **Should _Spot the mistakes_ be in?** It's the one example that starts out broken on purpose.
