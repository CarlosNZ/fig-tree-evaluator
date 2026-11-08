# Resilient dashboard

Each panel of this dashboard gets its data separately, from [JSONPlaceholder](https://jsonplaceholder.typicode.com/), a free API of made-up users. If one panel fails, the others should still show, so each has a `fallback` of its own: the value it returns in place of failing.

A fallback can read `$error`, the failure it caught. The profile's fallback says something different for a user who doesn't exist (a 404) than for any other failure, and the tasks panel's does the same with `$error.code`.

Things to try:

- Change `userId` to 999, a user who doesn't exist. Each panel handles it in its own way:
  - **Profile:** the request gets a 404, so it shows "No such user".
  - **Posts:** the request returns an empty list, which isn't a failure, so the count is 0.
  - **Tasks done:** there are no tasks, and 0 out of 0 is a division by zero, which fails with the code `non-finite-result`, so it shows "No tasks yet".
- The badge at the top of the expression says it's **Fully covered**: every failure has a fallback to catch it. Delete a panel's fallback, and the badge lists what could fail there.
