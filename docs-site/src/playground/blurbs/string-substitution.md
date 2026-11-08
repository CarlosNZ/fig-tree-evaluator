# Complex string substitution

`buildString` fills in a template's `{{…}}` tokens. The tokens in this one come from several places:

- **The data,** read straight into the template, such as `{{$data.user.name.first}}`.
- **An HTTP request,** which looks up the capital city of the user's country.
- **A `match`,** which words the friend count differently depending on how many there are.
- **A variable,** `pronoun`, which holds the wording for the user's pronouns. `{{$vars.pronoun.lives}}` reads a path into the variable's value: the object for `'she'`, for `'he'`, or for anything else.

Things to try:

- Change `pronouns` to `'they'`.
- Add or remove friends.
- Change `country`.
