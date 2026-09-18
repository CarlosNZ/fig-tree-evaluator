/**
 * Chunk 5.2 — `if`, `match` and `firstOf` (batch 1 in
 * docs-dev/v3-specs/v3-operator-parameters.md; register rows 1, 5, 6, 7, 8
 * in docs-dev/v3-specs/v3-cases-for-review.md).
 *
 * The claim these operators exist to make is negative: work they did not
 * choose never happens. So the assertions that matter are counts, taken
 * from a spy standing in for the expensive thing.
 */
import { coreOperators, defineOperator, FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

/** A stand-in for an expensive branch: counts, then answers. */
const tracked = () => {
  const calls: unknown[] = []
  const definition = defineOperator({
    name: 'track',
    description: 'Record that this branch ran',
    parameters: { value: { type: 'any', nullPolicy: 'value' } },
    positionalParams: ['value'],
    evaluate: ({ value }) => {
      calls.push(value)
      return value
    },
  })
  // `operators` REPLACES the core set, so the core list comes along
  return { calls, fig: new FigTree({ operators: [coreOperators, definition] }) }
}

// ── if ──────────────────────────────────────────────────────────────

describe('if', () => {
  test('picks a branch by truthiness, with null falsy', async () => {
    expect(await ev({ $if: [true, 'yes', 'no'] })).toBe('yes')
    expect(await ev({ $if: [false, 'yes', 'no'] })).toBe('no')
    expect(await ev({ $if: ['$data.missing', 'yes', 'no'] })).toBe('no')
    expect(await ev({ $if: ['', 'yes', 'no'] })).toBe('no')
    expect(await ev({ $if: [[], 'yes', 'no'] })).toBe('yes')
  })

  test('exactly one branch evaluates — the other never runs', async () => {
    const { calls, fig } = tracked()
    expect(
      await fig.evaluate({ $if: [true, { $track: 'taken' }, { $track: 'skipped' }] })
    ).toBe('taken')
    expect(calls).toEqual(['taken'])
  })

  test('the condition is evaluated, the branches are not, before the choice', async () => {
    const { calls, fig } = tracked()
    await fig.evaluate({
      $if: [{ $track: 0 }, { $track: 'a' }, { $track: 'b' }],
    })
    expect(calls).toEqual([0, 'b'])
  })

  test('an omitted else is null — success, not failure (register row 1)', async () => {
    expect(await ev({ $if: [false, 'yes'] })).toBe(null)
    // A fallback does not stand in for a missing else: nothing failed
    expect(await ev({ operator: 'if', condition: false, then: 'yes', fallback: 'fb' })).toBe(null)
  })

  test('an explicit null branch is an ordinary value', async () => {
    expect(await ev({ $if: [true, null, 'no'] })).toBe(null)
  })

  test('a fallback still catches a genuine failure in the taken branch', async () => {
    expect(
      await ev({ operator: 'if', condition: true, then: { $divide: [1, 0] }, fallback: 'fb' })
    ).toBe('fb')
  })

  test('the named face and the alias agree', async () => {
    expect(await ev({ operator: 'if', condition: true, then: 'a', else: 'b' })).toBe('a')
    expect(await ev({ '$?': [true, 'a', 'b'] })).toBe('a')
  })
})

// ── match ───────────────────────────────────────────────────────────

describe('match', () => {
  const branches = { open: 'Open', shut: 'Closed' }

  test('matches by the canonical string form of the value', async () => {
    expect(await ev({ $match: ['open', branches] })).toBe('Open')
    expect(await ev({ $match: [1, { 1: 'one', 2: 'two' }] })).toBe('one')
    expect(await ev({ $match: [true, { true: 'yes', false: 'no' }] })).toBe('yes')
  })

  test('only the matching branch evaluates', async () => {
    const { calls, fig } = tracked()
    const result = await fig.evaluate({
      $match: ['b', { a: { $track: 'a' }, b: { $track: 'b' }, c: { $track: 'c' } }],
    })
    expect(result).toBe('b')
    expect(calls).toEqual(['b'])
  })

  test('the default is taken on no match, and is itself lazy', async () => {
    const { calls, fig } = tracked()
    expect(
      await fig.evaluate({
        $match: ['zzz', { a: { $track: 'a' } }, { $track: 'fallback' }],
      })
    ).toBe('fallback')
    expect(calls).toEqual(['fallback'])
  })

  test('no match and no default is a failure a fallback catches (row 7)', async () => {
    expect((await failure({ $match: ['zzz', branches] })).code).toBe('operator-failure')
    expect(await ev({ operator: 'match', value: 'zzz', branches, fallback: 'fb' })).toBe('fb')
  })

  test('a null value matches no branch and falls to the default (row 8)', async () => {
    expect(await ev({ $match: ['$data.missing', { '': 'empty' }, 'defaulted'] })).toBe('defaulted')
    expect((await failure({ $match: ['$data.missing', branches] })).code).toBe('operator-failure')
  })

  test('a prototype key is not a branch', async () => {
    expect((await failure({ $match: ['toString', branches] })).code).toBe('operator-failure')
    expect((await failure({ $match: ['constructor', branches] })).code).toBe('operator-failure')
  })

  test('a dynamic branch map is evaluated whole, and its value returns verbatim', async () => {
    const labels = { open: 'Open', shut: '$data.neverRead' }
    // Values extracted from a data-sourced map are runtime data, never
    // re-parsed — the injection path v2 left open
    expect(await ev({ $match: ['shut', '$data.labels'] }, { labels })).toBe('$data.neverRead')
  })

  test('a dynamic map that is not an object is a type error', async () => {
    expect((await failure({ $match: ['a', '$data.nope'] })).code).toBe('type-check')
  })
})

// ── firstOf ─────────────────────────────────────────────────────────

describe('firstOf', () => {
  test('returns the first candidate that is not null', async () => {
    expect(await ev({ $firstOf: ['$data.nickname', '$data.name', 'Anonymous'] }, { name: 'Ada' }))
      .toBe('Ada')
  })

  test('skips only null — "", 0 and false are answers', async () => {
    expect(await ev({ $firstOf: ['', 'backup'] })).toBe('')
    expect(await ev({ $firstOf: [0, 'backup'] })).toBe(0)
    expect(await ev({ $firstOf: [false, 'backup'] })).toBe(false)
  })

  test('later candidates never evaluate — the whole point', async () => {
    const { calls, fig } = tracked()
    expect(await fig.evaluate({ $firstOf: [{ $track: 'primary' }, { $track: 'backup' }] })).toBe(
      'primary'
    )
    expect(calls).toEqual(['primary'])
  })

  test('candidates are tried in order until one answers', async () => {
    const { calls, fig } = tracked()
    expect(
      await fig.evaluate({
        $firstOf: [{ $track: null }, { $track: null }, { $track: 'third' }],
      })
    ).toBe('third')
    expect(calls).toEqual([null, null, 'third'])
  })

  test('all candidates null, or none at all, is null (row 5)', async () => {
    expect(await ev({ $firstOf: ['$data.a', '$data.b'] })).toBe(null)
    expect(await ev({ operator: 'firstOf', values: [] })).toBe(null)
    expect(await ev({ operator: 'firstOf', values: '$data.empty' }, { empty: [] })).toBe(null)
  })

  test('a failing candidate fails the node — it skips nulls, not errors (row 6)', async () => {
    expect((await failure({ $firstOf: [{ $divide: [1, 0] }, 'backup'] })).code).toBe(
      'non-finite-result'
    )
    // The recorded idiom: demote a risky candidate with its own fallback
    expect(
      await ev({ $firstOf: [{ $divide: [1, 0], fallback: null }, 'backup'] })
    ).toBe('backup')
  })

  test('a literal empty list warns as a dead expression', () => {
    const issues = fig.validate({ operator: 'firstOf', values: [] }).issues
    expect(issues.map((issue) => issue.severity)).toContain('warning')
  })
})

// ── and / or / not ──────────────────────────────────────────────────

describe('and / or', () => {
  test('return actual booleans, never an operand', async () => {
    // JS-style value-selecting `or` is not carried over — that is firstOf
    expect(await ev({ $or: ['', 'something'] })).toBe(true)
    expect(await ev({ $and: ['a', 'b'] })).toBe(true)
  })

  test('judge by FigTree truthiness, with null falsy', async () => {
    expect(await ev({ $and: [1, 'x', [], {}] })).toBe(true)
    expect(await ev({ $and: [1, ''] })).toBe(false)
    expect(await ev({ $and: [1, '$data.missing'] })).toBe(false)
    expect(await ev({ $or: [0, '', false] })).toBe(false)
    expect(await ev({ $or: [0, '$data.missing', 'x'] })).toBe(true)
  })

  test('compose with the comparisons', async () => {
    expect(
      await ev({
        $and: [{ $equal: [{ $plus: [7.5, 19] }, 26.5] }, { $notEqual: ['five', 'four'] }],
      })
    ).toBe(true)
  })

  test('a single operand is just its own truthiness', async () => {
    expect(await ev({ operator: 'and', values: ['x'] })).toBe(true)
    expect(await ev({ operator: 'or', values: [null] })).toBe(false)
  })
})

describe('not', () => {
  test('negates truthiness', async () => {
    expect(await ev({ $not: true })).toBe(false)
    expect(await ev({ $not: '' })).toBe(true)
    expect(await ev({ $not: 'x' })).toBe(false)
    // An array payload maps POSITIONALLY, so `[]` is zero arguments, not
    // an empty-array value — the named face is how you pass a literal array
    expect(await ev({ operator: 'not', value: [] })).toBe(false)
  })

  test('null is falsy, so it is the idiomatic "is this unset?" test', async () => {
    expect(await ev({ $not: '$data.user.disabled' })).toBe(true)
    expect(await ev({ $not: '$data.user.disabled' }, { user: { disabled: true } })).toBe(false)
  })

  test('the alias is `!`, reassigned from v2 where it meant notEqual', async () => {
    expect(await ev({ '$!': false })).toBe(true)
  })

  test('over a node that propagated null, negation affirms (register row 9)', async () => {
    // The recorded trap: `age` is missing, the comparison propagates null,
    // null is falsy, so `not` reports "is NOT over 18" from absent data.
    // The runtime behaviour is agreed; the authoring-time lint is deferred
    expect(await ev({ $not: { $greaterThan: ['$data.age', 18] } })).toBe(true)
    // The recommended remedies both work today
    expect(await ev({ $not: { $greaterThan: ['$data.age', 18], fallback: false } })).toBe(true)
    expect(
      await ev({ $not: { $greaterThan: { values: ['$data.age', 18], nullValueDefault: 99 } } })
    ).toBe(false)
  })
})

// ── hand-migrated from the frozen v2 suite ──────────────────────────

describe('hand-migrated: v2 6_conditional', () => {
  test('basic conditional, both faces', async () => {
    expect(await ev({ '$?': [true, 'A', 'B'] })).toBe('A')
    expect(await ev({ operator: 'if', condition: 'YES', then: 'YES', else: 'NO' })).toBe('YES')
    expect(await ev({ operator: 'if', condition: 0, then: 'YES', else: 'NO' })).toBe('NO')
  })

  test('conditional with arithmetic in the condition', async () => {
    expect(
      await ev({
        operator: 'if',
        condition: { $equal: [{ $plus: [7.5, 19] }, 26.5] },
        then: 'Correct',
        else: 'Wrong',
      })
    ).toBe('Correct')
  })

  test('conditional over a false logical expression', async () => {
    expect(
      await ev({
        '$?': [
          { $or: [{ $equal: [{ $plus: [7, 19] }, 26.5] }, { $notEqual: ['five', 'five'] }] },
          'Expression is True',
          'Expression is False',
        ],
      })
    ).toBe('Expression is False')
  })

  test('missing parameters fail statically, before evaluation', async () => {
    // v2 reported these at runtime, where a `fallback` could swallow them;
    // in v3 a missing required parameter is a static error by construction
    const issues = fig.validate({ operator: 'if' }).issues
    expect(issues.map((issue) => issue.code)).toContain('missing-required')
    expect((await failure({ operator: 'if' })).code).toBe('missing-required')
    // `then` is required, `else` is not
    expect(
      fig.validate({ operator: 'if', condition: 'YES', else: 'NO' }).issues.map((i) => i.code)
    ).toContain('missing-required')
    expect(fig.validate({ operator: 'if', condition: 'YES', then: 'YES' }).valid).toBe(true)
  })
})

describe('hand-migrated: v2 20_match — the card-game decision tree', () => {
  /**
   * v2's version leaned on four things v3 has retired: alias nodes
   * (`$difficultyYounger`), root-hoisted branch keys, a magic `fallback`
   * key *inside* the branches object, and `strict: false` on the
   * comparisons. The v3 rewrite puts each on its replacement — `vars`, the
   * `branches` parameter, the `default` parameter, and
   * `greaterThanOrEqual` — which makes this the phase's end-to-end case:
   * scoping, lazy branch selection and nested dispatch in one expression.
   */
  const decisionTree = {
    vars: {
      difficultyYounger: {
        $match: [
          '$data.preferredDifficulty',
          { easy: 'Go Fish', challenging: 'Rummy', hard: 'Rummy' },
        ],
      },
      difficultyOlder: {
        $match: ['$data.preferredDifficulty', { easy: 'Rummy', challenging: '500', hard: '500' }],
      },
    },
    operator: 'match',
    value: '$data.numberOfPlayers',
    branches: {
      1: {
        $if: [
          { $greaterThanOrEqual: ['$data.ageOfYoungestPlayer', 7] },
          'Solitaire',
          'No recommendations 😔',
        ],
      },
    },
    default: {
      $if: [
        { $greaterThanOrEqual: ['$data.ageOfYoungestPlayer', 5] },
        {
          $if: [
            { $lessThan: ['$data.ageOfYoungestPlayer', 8] },
            'Go Fish',
            {
              $if: [
                { $lessThan: ['$data.ageOfYoungestPlayer', 12] },
                '$vars.difficultyYounger',
                {
                  $if: [
                    { $lessThan: ['$data.ageOfYoungestPlayer', 16] },
                    '$vars.difficultyOlder',
                    {
                      operator: 'match',
                      value: '$data.numberOfPlayers',
                      branches: {
                        4: {
                          $if: [
                            { $equal: ['$data.preferredDifficulty', 'hard'] },
                            'Bridge',
                            '$vars.difficultyOlder',
                          ],
                        },
                      },
                      default: '$vars.difficultyOlder',
                    },
                  ],
                },
              ],
            },
          ],
        },
        'Snap',
      ],
    },
  }

  const play = (players: number, age: number, difficulty: string) =>
    ev(decisionTree, {
      numberOfPlayers: players,
      ageOfYoungestPlayer: age,
      preferredDifficulty: difficulty,
    })

  test.each([
    ['single player, 7+', 1, 12, 'easy', 'Solitaire'],
    ['single player, under 7', 1, 5, 'easy', 'No recommendations 😔'],
    ['multiple players, some under 5', 3, 4, 'easy', 'Snap'],
    ['multiple players, 5-8', 2, 5, 'easy', 'Go Fish'],
    ['multiple players, 8-12, challenging', 2, 9, 'challenging', 'Rummy'],
    ['multiple players, 12-16, easy', 4, 12, 'easy', 'Rummy'],
    ['3 players, 16+, challenging', 3, 18, 'challenging', '500'],
    ['4 players, 16+, challenging', 4, 16, 'challenging', '500'],
    ['4 players, 16+, hard', 4, 16, 'hard', 'Bridge'],
  ])('%s', async (_label, players, age, difficulty, expected) => {
    expect(await play(players as number, age as number, difficulty as string)).toBe(expected)
  })

  test('an unrecognized difficulty reaches a match with no branch and no default', async () => {
    const error = await rejection<FigTreeError>(play(4, 16, 'other'))
    expect(error.code).toBe('operator-failure')
    expect(error.message).toContain('other')
  })

  test('the branch not taken costs nothing — neither difficulty var evaluates', async () => {
    const { calls, fig: tracking } = tracked()
    const tree = {
      vars: { younger: { $track: 'younger' }, older: { $track: 'older' } },
      operator: 'match',
      value: '$data.numberOfPlayers',
      branches: { 1: 'Solitaire' },
      default: { $if: [true, '$vars.younger', '$vars.older'] },
    }
    expect(await tracking.evaluate(tree, { data: { numberOfPlayers: 1 } })).toBe('Solitaire')
    expect(calls).toEqual([])
  })

  test('a non-object branches value is a type error', async () => {
    expect((await failure({ $match: ['three', 'not an object'] })).code).toBe('type-check')
  })
})
