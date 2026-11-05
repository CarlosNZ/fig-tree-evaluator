# Group ferry booking

A family is booking the ferry, and each passenger's fare depends on their age. The expression goes through the passengers one at a time with `map`, giving each a line of the booking, then totals the fares. A group with at least two adults and a child gets 10% off.

- **Iterating:** `map` evaluates its `each` once per passenger. With `as: 'passenger'`, the current passenger is `$passenger`, and their position in the list, from 0, is `$passengerIndex`, which numbers the lines.
- **Variables:** `vars` holds values worked out once and read by name. `$vars.lines` is read three times, by the passengers list, the discount and the total. The fare table is a variable too, and each line has a `fareType` variable of its own.
- **Every element at once:** `$vars.lines[*].fare` is every line's fare, which `plus` adds up.

Things to try:

- Remove Wiremu. That leaves one adult, since Nan pays the senior fare, so there's no discount.
- Change Nan's age to 64, and she pays the adult fare.
- Change a passenger's age to `'unknown'`. Their fare type can't be worked out, so its fallback charges the adult fare, and the rest of the booking carries on as normal.
