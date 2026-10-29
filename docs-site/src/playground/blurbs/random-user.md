# Fetch and display a random user

This expression fetches a random user object by making an HTTP request to [https://randomuser.me/api/](https://randomuser.me/api/), and keeps it in a var. We then use this data to populate a templated string.

FigTree [caches](/guides/caching/) every request, so the request has `noCache: true`, otherwise we'd get the same user every time it's run.

Try removing `noCache` to see the difference.
