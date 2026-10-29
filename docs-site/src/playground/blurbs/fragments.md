# Fragments

If you expect your configurations to re-use a lot of common expressions (for example, looking up your app's database), you pre-define some [Fragments](/guides/fragments/), making subsequent expressions simpler.

In this case, two Fragments are defined, and can be explored in the "Configuration" panel:

- `getCapital`
- `getFlag`

They both take a `country` parameter, which the fragment reads as `"$params.country"`. `getFlag` gives it a default, so it's optional there.
