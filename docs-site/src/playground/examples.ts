/**
 * The Playground's examples, which its example picker offers. The demo app in
 * fig-tree-editor-react (`demo/`) reads this folder too, through a Vite alias
 * to this checkout, so an example is written once for both.
 *
 * Each example's blurb is a Markdown file, `blurbs/<id>.md`, with its images
 * in `blurbs/img/`, referenced by relative path. The fragments and custom
 * operators the examples use are in ./fragments.ts and ./operators.ts.
 */
export interface PlaygroundExample {
  /**
   * A slug, for the Playground's URL and for remembering the reader's last
   * pick, so renaming the menu entry breaks neither. Also names the blurb.
   */
  id: string
  /** The menu entry. */
  name: string
  /** The evaluation data. The demo keeps the data it has if not given. */
  data?: Record<string, unknown>
  expression: unknown
  /** How many levels of the tree start open. */
  collapse?: number
}

export const examples: PlaygroundExample[] = [
  {
    id: 'basics',
    name: '⚙️ Basic data fetching',
    data: {
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
      application: {
        questions: {
          q1: 'When were you born?',
          q2: 'What is your primary weapon',
        },
        responses: {
          q1: '1918',
          q2: 'Vibranium shield',
        },
      },
    },
    expression: { $plus: ['$data.user.firstName', ' ', '$data.user.lastName'] },
    collapse: 3,
  },
  {
    id: 'conditional-logic',
    name: '❓ Conditional logic',
    data: {
      film: { title: 'Deadpool & Wolverine', minAgeRating: 17 },
      patron: { age: 12, isParentAttending: true },
    },
    expression: {
      $if: {
        condition: {
          $or: [
            { $greaterThanOrEqual: ['$data.patron.age', '$data.film.minAgeRating'] },
            {
              $and: [
                { $greaterThanOrEqual: ['$data.patron.age', 13] },
                '$data.patron.isParentAttending',
              ],
            },
          ],
        },
        then: {
          $buildString: {
            template: 'Enjoy "{{movie}}"! 🍿🎬',
            substitutions: { movie: '$data.film.title' },
          },
        },
        else: "Sorry, try again when you're older 😔",
      },
    },
    collapse: 4,
  },
  {
    id: 'random-user',
    name: '🎲 String formatting with a random user',
    expression: {
      $buildString: {
        template:
          'Hello, {{$vars.user.name.first}} {{$vars.user.name.last}} from {{$vars.user.location.city}}, {{$vars.user.location.country}}!',
      },
      vars: {
        user: {
          $http: { url: 'https://randomuser.me/api/', returnPath: 'results[0]' },
          noCache: true,
        },
      },
    },
  },
  {
    id: 'string-substitution',
    name: '🧵 Complex string substitution',
    data: {
      user: {
        name: {
          first: 'Natasha',
          last: 'Romanoff',
        },
        country: 'Russia',
        friends: ['Steve', 'Bruce', 'Tony'],
        gender: 'Female',
      },
    },
    expression: {
      $buildString: {
        template:
          "This applicant's name is {{$data.user.name.first}} {{$data.user.name.last}}. {{genderLives}} in {{$data.user.country}}, where the capital city is {{capital}}. {{genderHas}} {{friendCount}}.",
        substitutions: {
          capital: {
            $http: {
              url: 'https://countriesnow.space/api/v0.1/countries/capital',
              method: 'post',
              body: { country: '$data.user.country' },
              returnPath: 'data.capital',
            },
            fallback: 'unknown',
          },
          friendCount: {
            $match: {
              value: '$vars.count',
              branches: { '0': 'no friends 😢', '1': 'only one friend' },
              default: {
                $if: {
                  condition: { $greaterThan: ['$vars.count', 4] },
                  then: 'loads of friends',
                  else: {
                    $buildString: {
                      template: '{{count}} friends',
                      substitutions: { count: '$vars.count' },
                    },
                  },
                },
              },
            },
            vars: { count: { $length: '$data.user.friends' } },
          },
          genderLives: {
            $match: {
              value: '$data.user.gender',
              branches: { Female: 'She lives', Male: 'He lives' },
              default: 'They live',
            },
          },
          genderHas: {
            $match: {
              value: '$data.user.gender',
              branches: { Female: 'She has', Male: 'He has' },
              default: 'They have',
            },
          },
        },
      },
    },
  },
  {
    id: 'city-list',
    name: '🏙️ City list from country selection',
    data: {
      userResponses: { name: 'Mohini', country: 'India' },
    },
    expression: {
      $http: {
        url: 'https://countriesnow.space/api/v0.1/countries/cities',
        method: 'post',
        body: { country: '$data.userResponses.country' },
        returnPath: 'data',
      },
      fallback: 'Country not specified',
    },
  },
  {
    id: 'decision-tree',
    name: '🌴 Decision Tree',
    data: {
      Info: 'Change the following values to get a card game recommendation!',
      numberOfPlayers: 1,
      ageOfYoungestPlayer: 12,
      preferredDifficulty: 'easy',
    },
    expression: {
      $match: {
        value: '$data.numberOfPlayers',
        branches: {
          '1': {
            $if: {
              condition: { $greaterThanOrEqual: ['$data.ageOfYoungestPlayer', 7] },
              then: 'Solitaire',
              else: 'No recommendations 😔',
            },
          },
        },
        default: {
          $if: {
            condition: { $greaterThanOrEqual: ['$data.ageOfYoungestPlayer', 5] },
            then: {
              $if: {
                condition: { $lessThan: ['$data.ageOfYoungestPlayer', 8] },
                then: 'Go Fish',
                else: {
                  $if: {
                    condition: { $lessThan: ['$data.ageOfYoungestPlayer', 12] },
                    then: '$vars.difficultyYounger',
                    else: {
                      $if: {
                        condition: { $lessThan: ['$data.ageOfYoungestPlayer', 16] },
                        then: '$vars.difficultyOlder',
                        else: {
                          $match: {
                            value: '$data.numberOfPlayers',
                            branches: {
                              '4': {
                                $if: {
                                  condition: { $equal: ['$data.preferredDifficulty', 'hard'] },
                                  then: 'Bridge',
                                  else: '$vars.difficultyOlder',
                                },
                              },
                            },
                            default: '$vars.difficultyOlder',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            else: 'Snap',
          },
        },
      },
      vars: {
        difficultyYounger: {
          $match: {
            value: '$data.preferredDifficulty',
            branches: { easy: 'Go Fish', challenging: 'Rummy', hard: 'Rummy' },
          },
        },
        difficultyOlder: {
          $match: {
            value: '$data.preferredDifficulty',
            branches: { easy: 'Rummy', challenging: '500', hard: '500' },
          },
        },
      },
    },
  },
  {
    id: 'star-wars',
    name: '🕵️ Vars (Star Wars 🚀)',
    data: {
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
        Wedge: 18,
        Porkins: 19,
        Yoda: 20,
        Palpatine: 21,
        'Boba Fett': 22,
        'IG-88': 23,
        Bossk: 24,
        'Lando Calrissian': 25,
        Lobot: 26,
        Ackbar: 27,
        'Mon Mothma': 28,
        'Arvel Crynyd': 29,
        Wicket: 30,
        'Nien Nunb': 31,
        'Qui-Gon Jinn': 32,
        'Nute Gunray': 33,
        'Chancellor Valorum': 34,
        Padmé: 35,
        'Jar Jar': 36,
        'Roos Tarpals': 37,
        'Rugor Nass': 38,
        'Ric Olié': 39,
        Watto: 40,
        Sebulba: 41,
        'Captain Panaka': 42,
        'Shmi Skywalker': 43,
        'Darth Maul': 44,
        'Bib Fortuna': 45,
        'Ayla Secura': 46,
        'Ratts Tyerel': 47,
        'Dud Bolt': 48,
        Gasgano: 49,
        'Ben Quadinaros': 50,
        'Mace Windu': 51,
        'Ki-Adi-Mundi': 52,
        'Kit Fisto': 53,
        'Eeth Koth': 54,
        'Adi Gallia': 55,
        'Saesee Tiin': 56,
        'Yarael Poof': 57,
        'Plo Koon': 58,
        'Mas Amedda': 59,
        'Gregar Typho': 60,
        Cordé: 61,
        'Cliegg Lars': 62,
        'Poggle the Lesser': 63,
        'Luminara Unduli': 64,
        'Barriss Offee': 65,
        Dormé: 66,
        'Count Dooku': 67,
        'Bail Organa': 68,
        'Jango Fett': 69,
        'Zam Wesell': 70,
        'Dexter Jettster': 71,
        'Lama Su': 72,
        'Taun We': 73,
        'Jocasta Nu': 74,
        'R4-P17': 75,
        'Wat Tambor': 76,
        'San Hill': 77,
        'Shaak Ti': 78,
        'General Grievous': 79,
        Tarfful: 80,
        'Raymus Antilles': 81,
        'Sly Moore': 82,
        'Tion Medon': 83,
      },
    },
    expression: {
      $buildString: {
        template: 'Name: %1\nGender: %2\nHomeworld: %3\nFirst appearance: %4',
        substitutions: [
          '$vars.character.name',
          '$vars.character.gender',
          { $http: { url: '$vars.character.homeworld', returnPath: 'name' } },
          { $http: { url: '$vars.character.films[0]', returnPath: 'title' } },
        ],
      },
      fallback: {
        $plus: ["Can't retrieve data for character: ", '$data.selected'],
        fallback: '‼️',
      },
      vars: {
        character: {
          $http: {
            url: {
              $buildString: {
                template: 'https://swapi.py4e.com/api/people/%1',
                substitutions: [{ $get: { path: '$data.selected', from: '$data.characters' } }],
              },
            },
          },
          fallback: 'Nope',
        },
      },
    },
  },
  {
    id: 'fragments',
    name: '🧩 Fragments',
    data: {
      myFavouriteCountry: 'New Zealand',
    },
    expression: {
      $buildString: {
        template: '===={{country}}====\nCapital city: {{capital}}\nFlag: {{flag}}',
        substitutions: {
          capital: { $getCapital: { country: '$vars.selectedCountry' } },
          flag: { $getFlag: { country: '$vars.selectedCountry' } },
          country: '$vars.selectedCountry',
        },
      },
      fallback: "Can't find country 😔",
      vars: {
        selectedCountry: { $get: { path: 'myFavouriteCountry', default: 'Country not found' } },
      },
    },
    collapse: 3,
  },
  {
    id: 'custom-operators',
    name: '➡ Custom Operators',
    data: {
      backwardsInput: " :si etad s'yadoT",
      toCase: 'upper',
    },
    expression: {
      $changeCase: {
        string: { $plus: [{ $reverse: '$data.backwardsInput' }, { $currentDate: {} }] },
        toCase: '$data.toCase',
      },
    },
    collapse: 4,
  },
]
