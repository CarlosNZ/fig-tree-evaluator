# Complex string substitution

This expression features a much more complex templated string, intended to showcase the capabilities of the [String Substitution](/reference/operators/#op-buildString) operator.

The values substituted into the output string are based on several different factors:

- Data references written straight into the template (e.g. `{{$data.user.name.first}}`)
- An HTTP request to look up the country's capital city
- Counting the number of friends, and choosing different text depending on the count
- Different wording in several places depending on the gender of the `user`, utilising the [Match](/reference/operators/#op-match) operator

Try changing all these values and see the output differences.
