# Random user

This expression fetches a random user from [randomuser.me](https://randomuser.me/), and fills a template with their details.

FigTree [caches](/guides/caching/) results, such as the responses to requests, so evaluating it again gives the same user. The cache is in the **Configuration** panel:

- **Clear cache** empties it, so the next evaluation gets a new user.
- Unticking **Use the cache** turns it off, as does adding `noCache: true` to the `$http` node. Then every evaluation gets a new user.
