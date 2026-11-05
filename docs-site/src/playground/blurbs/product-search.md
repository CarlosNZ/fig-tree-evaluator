# Product search

The `sql` operator queries a database. This one is the classic [Northwind](https://github.com/pthom/northwind_psql) sample of a food wholesaler, running in your browser on SQLite.

The search term and the maximum price come from the data, and go into the query as **values**, `$1` and `$2`, never as part of the SQL itself. A second query counts every product that matches the term, with `shape: 'firstValue'`, which returns the one value it selects rather than a list of rows. Then `map` turns each row into a line of text, with a warning when stock is low.

Things to try:

- Change `maxPrice` to 30, or `search` to `'ch'`.
- Search for `'; DROP TABLE products; --`. It's only ever a value to match, so it finds nothing, and the table is still there.
