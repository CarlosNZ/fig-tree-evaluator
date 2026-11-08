# What to wear today

This expression looks up today's forecast for a city with two requests to [Open-Meteo](https://open-meteo.com/): one to find the city, and one for its forecast. Each request is a **variable**, in the `vars` at the top:

- **`place`** finds the city from its name in the data.
- **`forecast`** reads `$vars.place.latitude` and `$vars.place.longitude`, so one variable feeds the next.

The result reads `forecast` four times, but a variable is evaluated once, so one forecast request is sent. A variable is also evaluated only when something reads it: with no city, the `$if` returns its `else`, nothing reads either variable, and no request is sent at all.

Things to try, with your browser's network tab open to watch the requests:

- Change `city` to somewhere else, such as `'Reykjavík'`.
- Make `city` empty.
- Change `city` to a made-up name, such as `'Qwertyville'`.

Evaluating again for a city you've already tried sends nothing, since FigTree caches the responses.
