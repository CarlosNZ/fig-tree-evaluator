# A form, configured

FigTree is for logic in places that can only hold data, such as a form definition. This expression is a sign-up form, written as a form library might take it, and the data is what's been filled in so far. The form takes a title and a list of fields, each of this shape:

```ts nocheck
interface FormField {
  name: string // the field's key in the data
  label: string
  type: 'select' | 'text' | 'number'
  options?: string[] // a select's choices
  required?: boolean
  visible?: boolean // true if left out
  comment?: string // a note shown under the label
}
```

Most of each field's settings are fixed values, but any of them can be a rule, and each field with one has a `comment` saying what it does:

- **`options`**, on the city: the cities in the chosen country, looked up from an [online countries database](https://countriesnow.space/). Its `fallback` gives an empty list when the lookup fails, so the form always has a list to show.
- **`required`**, on the postcode: required unless the country doesn't use postcodes.
- **`visible`**, on the licence number: shown only to someone 16 or over.

The **Form** view on the left is that form, drawn from the expression's result, which is worked out again each time you change the expression or the data. Filling it in edits the data, as it would in an app, so the rules follow what you type. Switch to **Data** to see what the form has written, or press **Evaluate** at the top of the tree for the result itself.

Things to try:

- Choose New Zealand as the country. The city list is much longer, and the postcode becomes required.
- Change the age to 15, and the licence number goes.
- Change a rule in the expression, such as the licence's minimum age, and the form follows.
- In **Data**, change `country` to one the lookup doesn't know, such as `'Narnia'`, and the city list is empty.

To see FigTree in a full form library, [this example](https://carlosnz.github.io/jsonforms-with-figtree-demo/) uses it to add dynamic behaviour to [JSON Forms](https://jsonforms.io/).
