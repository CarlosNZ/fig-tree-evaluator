import { EvaluatorNode, FigTreeOptions } from 'fig-tree-evaluator'
import { JsonEditorProps } from 'json-edit-react'

export interface DemoData {
  name: string
  content: string // Markdown
  objectData?: object
  objectJsonEditorProps?: Omit<JsonEditorProps, 'data'>
  expression: EvaluatorNode
  expressionCollapse?: number
  figTreeOptions?: FigTreeOptions
}

export const demoData: DemoData[] = [
  {
    name: '⚙️ Basic data fetching',
    content: `
# The Basics

\`\`\`
{
  "operator": "+",
  "values": [
    {
      "operator": "getData",
      "property": "user.firstName"
    },
    " ",
    {
      "operator": "getData",
      "property": "user.lastName"
    }
  ]
}
\`\`\`

Here, the **+** operator concatenates the results of its \`values\` array, two
of which pull values from the object on the left, which represents data that would be available to the evaluator in your application.

Experiment with changing the values of the data object as well as the object properties being referenced. (See what happens if you reference a path that doesn't exist, then try adding a [\`fallback\`](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#other-common-properties) to handle it.)

Click the **+** button to see the result, or either of the **getData** buttons to evaluate the child elements individually.
`,
    objectData: {
      user: {
        id: 2,
        firstName: 'Steve',
        lastName: 'Rogers',
        title: 'The First Avenger',
      },
      organisation: {
        id: 1,
        name: 'The Avengers',
        category: 'Superheroes',
      },
      form: {
        q1: 'Thor',
        q2: 'Asgard',
      },
      form2: {
        q1: 'Company Registration',
        q2: 'XYZ Chemicals',
      },
      application: {
        questions: {
          q1: 'What is the answer?',
          q2: 'Enter your name',
        },
      },
    },
    expression: {
      operator: '+',
      values: [
        { operator: 'getData', property: 'user.firstName' },
        ' ',
        { operator: 'getData', property: 'user.lastName' },
      ],
    },
    expressionCollapse: 3,
  },
  {
    name: '❓ Conditional logic',
    content: `
# Conditional logic

The result of this expression determines whether the filmgoer is allowed entry to the film, based on their age and whether or not they have a parent in attendance.

The rule is: the filmgoer must meet the minimum age restriction, unless they have a parent with them, in which case they must be over 13 years old.

Note that the deeper **getData** nodes are written using the [Shorthand syntax](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#shorthand-syntax). This is just a convenience to make complex expressions less verbose. So instead of:

\`\`\`
{
"operator": "getData",
"property": "patron.age"
}
\`\`\`

we can just write:

\`\`\`
{ "$getData": "patron.isParentAttending" }
\`\`\`
`,
    objectData: {
      film: { title: 'Deadpool & Wolverine', minAgeRating: 17 },
      patron: { age: 12, isParentAttending: true },
    },
    expression: {
      operator: '?',
      condition: {
        operator: 'or',
        values: [
          {
            operator: '>',
            values: [{ $getData: 'patron.age' }, { $getData: 'film.minAgeRating' }],
            strict: false,
          },
          {
            operator: 'and',
            values: [
              { operator: '>', values: [{ $getData: 'patron.age' }, 13], strict: false },
              { $getData: 'patron.isParentAttending' },
            ],
          },
        ],
      },
      valueIfTrue: {
        operator: 'stringSubstitution',
        string: 'Enjoy "{{movie}}"! 🍿🎬',
        substitutions: { movie: { operator: 'getData', property: 'film.title' } },
      },
      valueIfFalse: "Sorry, try again when you're older 😔",
    },
    expressionCollapse: 4,
  },
  {
    name: '🎲 String formatting with a random user',
    content: `
# Fetch and display a random user

This expression fetches a random user object by making an HTTP request to [https://randomuser.me/api/](https://randomuser.me/api/). We then use this data to populate a templated string.

Note that this query requires the FigTree [cache](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#caching-memoization) to be disabled, otherwise we'd get display the same result every time it's run. (You can see the "Use cache" option has been disabled in the "Configuration" panel.)

Try toggling the "Use cache" setting to see the difference.
    `,
    objectData: { Info: 'Data object not used' },
    expression: {
      operator: 'stringSubstitution',
      string: 'Hello, {{name.first}} {{name.last}} from {{location.city}}, {{location.country}}!',
      substitutions: {
        operator: 'get',
        url: 'https://randomuser.me/api/',
        returnProperty: 'results[0]',
      },
    },
    objectJsonEditorProps: { collapse: 1 },
    figTreeOptions: { useCache: false },
  },
  {
    name: '🧵 Complex string substitution',
    content: `
This expression features a much more complex templated string, intended to showcase the capabilities of the [String Substitution](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#string_substitution) operator.

The values substituted into the output string are based on several different factors:

- Simple **getData** references (e.g. \`user.name.first\`)
- An [HTTP request](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#get) to lookup the country's capital city
- [Counting](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#count) the number of friends and presenting different text output based on the \`numberMap\`
- Different wording in several places depending on the gender of the \`user\`, utilising the [Match](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#match) operator

Try changing all these values and see the output differences.
    `,
    objectData: {
      user: {
        name: {
          first: 'Natasha',
          last: 'Romanoff',
        },
        country: 'Russia',
        friends: ['Steve', 'Bruce', 'Tony'],
        gender: 'female',
      },
    },
    expression: {
      operator: 'stringSubstitution',
      string:
        "This applicant's name is {{user.name.first}} {{user.name.last}}. {{genderLives}} in {{user.country}}, where the capital city is {{capital}}. {{genderHas}} {{friendCount}}.",
      replacements: {
        capital: {
          operator: 'GET',
          url: {
            operator: '+',
            values: ['https://restcountries.com/v3.1/name/', { $getData: 'user.country' }],
          },
          returnProperty: '[0].capital[0]',
          fallback: 'unknown',
        },
        friendCount: { operator: 'count', values: { $getData: 'user.friends' }, fallback: 0 },
        genderLives: {
          operator: 'match',
          matchExpression: { $getData: 'user.gender' },
          branches: { female: 'She lives', male: 'He lives' },
          fallback: 'They live',
        },
        genderHas: {
          operator: 'match',
          matchExpression: { $getData: 'user.gender' },
          branches: { female: 'She has', male: 'He has' },
          fallback: 'They have',
        },
      },
      numberMap: {
        friendCount: {
          '0': 'no friends 😢',
          '1': 'only one friend',
          other: '{} friends',
          '>4': 'loads of friends',
        },
      },
    },
    objectJsonEditorProps: { collapse: 3 },
  },
  {
    name: '🏙️ City list from country selection',
    content: `
# List of cities based on country selection

A classic case for a form input is to choose your country from a drop-down, then subsequently select from a list of cities based on your selected country. With a FigTree expression, we can populate this list dynamically with a call to an [online countries database](https://countriesnow.space/).

This expression returns the city list based on the \`country\` value in \`userResponses\`. You can see this applied to a real form with [this example](https://carlosnz.github.io/jsonforms-with-figtree-demo/) which uses FigTree to extend the dynamic functionality of [JSON Forms](https://jsonforms.io/).

<img src="src/img/country_city_form.png" width="500"/>

Note the \`fallback\` property used here — an array with a "Loading..." indicator. This ensures that the Cities dropdown can render with valid \`options\` list even if the online lookup returns an error due to an invalid or incomplete "country" value.
`,
    objectData: {
      userResponses: { name: 'Mohini', country: 'India' },
    },
    expression: {
      operator: 'POST',
      url: 'https://countriesnow.space/api/v0.1/countries/cities',
      returnProperty: 'data',
      parameters: {
        country: {
          $getData: 'userResponses.country',
        },
      },
      fallback: 'Country not specified',
    },
  },
  {
    name: '🌴 Decision Tree',
    content: `
# Decision Tree (for card games)

This expression demonstrates a fairly convoluted [Decision tree](https://en.wikipedia.org/wiki/Decision_tree), making heavy use of the [Match](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#match) operator to handle conditional logic with multiple branches.

A diagram of this particular tree can be found [here](https://user-images.githubusercontent.com/5456533/208660132-39f42ecf-894f-4e7a-891d-ce3a2d184d02.png).

*Hot tip: Click the "Expand" icon at the top of the expression object while holding "Option"/"Alt" to quickly expand the entire expression tree at once.*

This expression also features [Alias nodes](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#alias-nodes), which reduces the amount of duplication required in this structure.
    `,
    objectData: {
      Info: 'Change the following values to get a card game recommendation! (Difficultly can be either "easy" or "challenging")',
      numberOfPlayers: 1,
      ageOfYoungestPlayer: 12,
      preferredDifficulty: 'easy',
    },
    objectJsonEditorProps: {
      restrictEdit: ({ key }) => key === 'Info',
      restrictAdd: true,
      restrictDelete: true,
    },
    expression: {
      operator: 'match',
      matchExpression: { operator: 'objProps', property: 'numberOfPlayers' },
      branches: {
        '1': {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 7],
            strict: false,
          },
          ifTrue: 'Solitaire',
          ifFalse: 'No recommendations 😔',
        },
        fallback: {
          operator: '?',
          condition: {
            operator: '>',
            values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 5],
            strict: false,
          },
          ifTrue: {
            operator: '?',
            condition: {
              operator: '<',
              values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 8],
            },
            ifTrue: 'Go Fish',
            ifFalse: {
              operator: '?',
              condition: {
                operator: '<',
                values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 12],
              },
              ifTrue: '$difficultyYounger',
              ifFalse: {
                operator: '?',
                condition: {
                  operator: '<',
                  values: [{ operator: 'objProps', property: 'ageOfYoungestPlayer' }, 16],
                },
                ifTrue: '$difficultyOlder',
                ifFalse: {
                  '4': {
                    operator: '?',
                    condition: {
                      operator: '=',
                      values: [{ operator: 'objProps', property: 'preferredDifficulty' }, 'hard'],
                    },
                    ifTrue: 'Bridge',
                    ifFalse: '$difficultyOlder',
                  },
                  operator: 'match',
                  match: { operator: 'objProps', property: 'numberOfPlayers' },
                  fallback: '$difficultyOlder',
                },
              },
            },
          },
          ifFalse: 'Snap',
        },
      },
      $difficultyYounger: {
        operator: 'switch',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Go Fish',
        challenging: 'Rummy',
        hard: 'Rummy',
      },
      $difficultyOlder: {
        operator: 'match',
        matchExpression: { operator: 'objProps', property: 'preferredDifficulty' },
        easy: 'Rummy',
        challenging: '500',
        hard: '500',
      },
    },
  },
  {
    name: '🕵️ Alias nodes (Star Wars 🚀)',
    content: '# TO-DO',
    objectData: {
      title: 'Star Wars',
      selected: 'Luke',
      characters: {
        Luke: 1,
        'C-3PO': 2,
        'R2-D2': 3,
        Vader: 4,
        Leia: 5,
        Owen: 6,
        Beru: 7,
        'R5-D4': 8,
        Biggs: 9,
        'Obi-Wan': 10,
        Anakin: 11,
        Tarkin: 12,
        Chewbacca: 13,
        Han: 14,
        Greedo: 15,
        Jabba: 16,
        Wedge: 17,
        Porkins: 19,
        Yoda: 20,
        Palpatine: 21,
      },
    },
    expression: {
      operator: 'stringSubstitution',
      string: 'Name: %1\nGender: %2\nHomeworld: %3\nFirst appearance: %4',
      substitutions: [
        { operator: 'getData', property: 'name', additionalData: '$character' },
        { operator: 'getData', property: 'gender', additionalData: '$character' },
        {
          operator: 'get',
          url: { operator: 'getData', property: 'homeworld', additionalData: '$character' },
          returnProperty: 'name',
        },
        {
          operator: 'get',
          url: { operator: 'getData', property: 'films[0]', additionalData: '$character' },
          returnProperty: 'title',
        },
      ],
      fallback: {
        operator: '+',
        values: ["Can't find character: ", { $getData: 'selected' }],
        fallback: '‼️',
      },
      $character: {
        operator: 'GET',
        url: {
          operator: '+',
          values: [
            'https://swapi.dev/api/people/',
            {
              operator: 'getData',
              property: {
                operator: 'substitute',
                string: 'characters.%1',
                substitutions: [{ operator: 'getData', property: 'selected' }],
              },
            },
          ],
        },
        fallback: 'Nope',
      },
    },
  },
  {
    name: '🧩 Fragments',
    content: `
# Fragments

Say you have...
    `,
    objectData: {
      myFavouriteCountry: 'New Zealand',
    },
    expression: {
      operator: 'stringSubstitution',
      string: '===={{country}}====\nCapital city: {{capital}}\nFlag: {{flag}}',
      replacements: {
        capital: { fragment: 'getCapital', $country: '$selectedCountry' },
        flag: { fragment: 'getFlag', $country: '$selectedCountry' },
        country: '$selectedCountry',
      },
      fallback: "Can't find country 😔",
      $selectedCountry: {
        operator: 'getData',
        property: 'myFavouriteCountry',
        fallback: 'Country not found',
      },
    },
    expressionCollapse: 3,
    figTreeOptions: {
      fragments: {
        getCapital: {
          operator: 'GET',
          url: {
            operator: 'stringSubstitution',
            string: 'https://restcountries.com/v3.1/name/%1',
            replacements: ['$country'],
          },
          returnProperty: '[0].capital',
          outputType: 'string',
          metadata: {
            description: "Gets a country's capital city",
            parameters: [{ name: '$country', type: 'string', required: true }],
          },
        },
        getFlag: {
          operator: 'GET',
          children: [
            {
              operator: 'stringSubstitution',
              string: 'https://restcountries.com/v3.1/name/%1',
              replacements: ['$country'],
              default: 'New Zealand',
            },
            [],
            'flag',
          ],
          outputType: 'string',
          metadata: {
            description: "Gets a country's flag",
            parameters: [
              { name: '$country', type: 'string', required: true, default: 'New Zealand' },
            ],
          },
        },
      },
    },
  },
  {
    name: '🧩 Custom Functions',
    content: `
# Custom Functions

Say you have...
    `,
    objectData: {
      myFavouriteCountry: 'New Zealand',
    },
    expression: {
      operator: 'stringSubstitution',
      string: '===={{country}}====\nCapital city: {{capital}}\nFlag: {{flag}}',
      replacements: {
        capital: { fragment: 'getCapital', $country: '$selectedCountry' },
        flag: { fragment: 'getFlag', $country: '$selectedCountry' },
        country: '$selectedCountry',
      },
      fallback: "Can't find country 😔",
      $selectedCountry: {
        operator: 'getData',
        property: 'myFavouriteCountry',
        fallback: 'Country not found',
      },
    },
  },
]
