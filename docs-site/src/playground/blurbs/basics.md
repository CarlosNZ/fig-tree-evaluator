# The Basics

```
{
  "$plus": ["$data.user.firstName", " ", "$data.user.lastName"]
}
```

A basic expression that just joins a couple of values pulled from some form data. A string such as `"$data.user.firstName"` is a _reference_: it reads that path from the data object.

Experiment with changing the values of the data object as well as the paths being referenced. (See what happens if you reference a path that doesn't exist: it reads as `null`, so the whole result is `null`. Then try wrapping the reference in a `firstNonNull` to give it a default.)

Click the **$plus** button to see the result.

Try out some of the other [operators](/reference/operators/), and build your own expressions from scratch.
