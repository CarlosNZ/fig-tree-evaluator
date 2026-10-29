# Vars

If you have the same data referenced more than once in your expression, it can be a good idea to declare it in a `vars` block so it's only evaluated once, particularly if it's a network request.

In this case, the `character` var pulls a chunk of data from [https://swapi.py4e.com/](https://swapi.py4e.com/) and then values from it are substituted into the final expression, or used as inputs to further lookups.

Change the `selected` character name to look up a different Star Wars character.

<div style="display:flex;justify-content:center">
<img src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzVvd2lsNjFqZHJ0NXZrMmE0MmMxbm5tcmcxOWF2NTIwdno5a3QwNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3ofSB4uhagGiWdSVbi/giphy.webp"/>
</div>
