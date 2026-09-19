/**
 * Chunk 7.2 — the two renderers, `buildString` and `join` (batch 4 in
 * docs-dev/v3-specs/v3-operator-parameters.md; register rows 15–19 and 22
 * in docs-dev/v3-specs/v3-cases-for-review.md).
 *
 * `buildString` is hand-migrated from
 * test/v2-working/9_stringSubstitution.test.ts, whose `$N` block converts
 * by the mechanical `$N` → `%N` rewrite the migration doc prescribes. The
 * behaviours v3 deletes are recorded here as their replacements: rank
 * compaction becomes strict indexing, the silent `""` for an unmatched
 * token becomes a literal render, the `{{name}}`-from-data fallback and
 * its re-evaluation are gone, bare path drilling inside a token is gone,
 * the escape machinery is gone, and `numberMapping` composes as an
 * ordinary `match`. `join` is new in v3 and has no oracle to migrate.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))
const codes = (expression: unknown) => fig.validate(expression).issues.map((issue) => issue.code)

const data = {
  user: { first: 'Ada', id: 42, name: { first: 'Carl' } },
  count: 3,
  total: 10,
  tags: ['red', 'green'],
}

// ── buildString: positional mode ────────────────────────────────────

describe('buildString — positional %N', () => {
  test('the everyday face', async () => {
    expect(await ev({ $buildString: ['Hello, %1, welcome.', 'friend'] })).toBe(
      'Hello, friend, welcome.'
    )
    expect(await ev({ $buildString: ['%1 of %2 items', '$data.count', '$data.total'] }, data)).toBe(
      '3 of 10 items'
    )
  })

  test('the canonical face agrees', async () => {
    expect(await ev({ operator: 'buildString', template: '%1!', substitutions: ['hi'] })).toBe(
      'hi!'
    )
  })

  test('%N is a strict 1-based INDEX, never a rank — v2 compacted, v3 does not', async () => {
    // v2: 'Two out of every 3 people are stupid' (ranks zipped in order)
    expect(
      await ev({ $buildString: ['%2 out of every %3 people are %1', 'stupid', 'Two', 3] })
    ).toBe('Two out of every 3 people are stupid')
    // …but a gap no longer silently re-ranks: row 17
    expect(await ev({ $buildString: ['My %1 is %3', 'name', 'Smith'] })).toBe('My name is %3')
  })

  test('digits are greedy, and repeats render the same value', async () => {
    expect(
      await ev({ $buildString: { template: '%12', substitutions: Array(12).fill('x') } })
    ).toBe('x')
    expect(await ev({ $buildString: ['%1 is the same as %1 but not %2', 'THIS', 'THAT'] })).toBe(
      'THIS is the same as THIS but not THAT'
    )
  })

  test('a % not followed by digits needs no ceremony', async () => {
    expect(await ev({ $buildString: ['20% off %1', 'today'] })).toBe('20% off today')
  })

  test('a percent-encoded URL survives — the no-escape design at work', async () => {
    const url = 'https://x.test/?q=%20foo&r=%1'
    expect(await ev({ $buildString: [url, 'bound'] })).toBe('https://x.test/?q=%20foo&r=bound')
  })

  test('a literal %N is delivered through a substitution', async () => {
    expect(await ev({ $buildString: ['Enter code %1 at checkout', '%1'] })).toBe(
      'Enter code %1 at checkout'
    )
  })

  test('surplus substitutions are legal and simply unused', async () => {
    expect(await ev({ $buildString: ['%1', 'used', 'spare'] })).toBe('used')
  })

  test('a single-token template returns the RENDERING, never the value', async () => {
    expect(await ev({ $buildString: ['%1', 42] })).toBe('42')
    expect(typeof (await ev({ $buildString: ['%1', 42] }))).toBe('string')
  })

  test('the substitutions can arrive whole, from a node', async () => {
    expect(
      await ev({
        $buildString: {
          template: '%1 %2 %3 %4',
          substitutions: {
            $plus: [
              ['One', 'Two'],
              ['Three', 'Four'],
            ],
          },
        },
      })
    ).toBe('One Two Three Four')
  })

  test('the template itself can be an expression', async () => {
    expect(
      await ev({
        $buildString: {
          template: { $plus: ['May the %1', ' be with %2'] },
          substitutions: ['force', 'you'],
        },
      })
    ).toBe('May the force be with you')
  })
})

// ── buildString: named mode ─────────────────────────────────────────

describe('buildString — named {{name}}', () => {
  test('exact-match against the object keys', async () => {
    expect(
      await ev({
        $buildString: {
          template: 'Dear {{first}} {{last}}',
          substitutions: { first: 'Ada', last: 'L' },
        },
      })
    ).toBe('Dear Ada L')
  })

  test('bare path drilling inside a token is dead — v2 resolved it', async () => {
    expect(
      await ev({
        $buildString: { template: '{{inner.two}}', substitutions: { inner: { two: 'x' } } },
      })
    ).toBe('{{inner.two}}')
  })

  test('the data-fallback injection path is gone — a token never reads $data by itself', async () => {
    expect(
      await ev({ $buildString: { template: '{{user}}', substitutions: { other: 1 } } }, data)
    ).toBe('{{user}}')
  })

  test('a substituted value is never re-scanned', async () => {
    expect(
      await ev({
        $buildString: { template: 'Bio: {{bio}}', substitutions: { bio: 'call me {{phone}}' } },
      })
    ).toBe('Bio: call me {{phone}}')
  })

  test('cross-style tokens are inert in the other mode', async () => {
    expect(
      await ev({ $buildString: { template: '%1 {{a}}', substitutions: { a: 'named' } } })
    ).toBe('%1 named')
    expect(await ev({ $buildString: ['{{a}} %1', 'positional'] })).toBe('{{a}} positional')
  })
})

// ── buildString: the rendering ledger (row 15) ──────────────────────

describe('buildString — the rendering ledger', () => {
  test('an unbound token renders its own text, verbatim', async () => {
    expect(
      await ev(
        { $buildString: { template: 'Hi {{first}} {{last}}', substitutions: '$data.subs' } },
        {
          subs: { first: 'Carl' },
        }
      )
    ).toBe('Hi Carl {{last}}')
    expect(await ev({ $buildString: ['%1 and %2', 'one'] })).toBe('one and %2')
  })

  test('a bound-but-null value renders "" — absence renders as nothing', async () => {
    expect(await ev({ $buildString: ['%1 %2', '$data.user.first', '$data.user.last'] }, data)).toBe(
      'Ada '
    )
  })

  test('composites render a self-signalling placeholder, never [object Object]', async () => {
    expect(await ev({ $buildString: ['%1', '$data.tags'] }, data)).toBe('<array>')
    expect(await ev({ $buildString: ['%1', '$data.user'] }, data)).toBe('<object>')
  })

  test('booleans and numbers take the stringification table', async () => {
    expect(await ev({ $buildString: ['%1 %2', true, 4.5] })).toBe('true 4.5')
  })

  test('a null template propagates, and firstOf composes over it', async () => {
    expect(await ev({ $buildString: ['$data.missing', 'x'] }, data)).toBeNull()
    expect(
      await ev(
        {
          $firstOf: [
            { $buildString: ['$data.i18n.greeting', '$data.user.first'] },
            { $buildString: ['Hello, %1!', '$data.user.first'] },
          ],
        },
        data
      )
    ).toBe('Hello, Ada!')
  })

  test('an unused substitution still evaluates, and a failing one fails the node (row 16)', async () => {
    const error = await failure({ $buildString: ['%1', 'used', { $divide: [1, 0] }] })
    expect(error.code).toBe('non-finite-result')
  })

  test('the shield for a risky unused value is its own fallback', async () => {
    expect(await ev({ $buildString: ['%1', 'used', { $divide: [1, 0], fallback: null }] })).toBe(
      'used'
    )
  })
})

// ── buildString: trim, nullValueDefault, closeGaps ──────────────────

describe('buildString — trim', () => {
  test('default off: values render untouched', async () => {
    expect(await ev({ $buildString: ['*%1*', '  padded  '] })).toBe('*  padded  *')
  })

  test('on: every rendered value is trimmed, the template text never is', async () => {
    expect(
      await ev({ $buildString: { template: ' *%1* ', substitutions: ['  padded  '], trim: true } })
    ).toBe(' *padded* ')
  })

  test('operatorDefaults can set it host-wide', async () => {
    const trimming = new FigTree({ operatorDefaults: { buildString: { trim: true } } })
    expect(await trimming.evaluate({ $buildString: ['*%1*', ' x '] })).toBe('*x*')
  })
})

describe('buildString — nullValueDefault', () => {
  test('a null value renders it instead of ""', async () => {
    expect(
      await ev({
        $buildString: {
          template: 'Name: {{name}}',
          substitutions: { name: null },
          nullValueDefault: '<unknown>',
        },
      })
    ).toBe('Name: <unknown>')
  })

  test('unset keeps the agreed "" row', async () => {
    expect(
      await ev({ $buildString: { template: 'Name: {{name}}', substitutions: { name: null } } })
    ).toBe('Name: ')
  })

  test('it renders through the table, and composites stay out of its reach', async () => {
    expect(
      await ev(
        {
          $buildString: {
            template: '%1 %2',
            substitutions: [null, '$data.tags'],
            nullValueDefault: 0,
          },
        },
        data
      )
    ).toBe('0 <array>')
  })

  test('unbound tokens are untouched by it', async () => {
    expect(
      await ev({
        $buildString: { template: '%1 %2', substitutions: [null], nullValueDefault: '-' },
      })
    ).toBe('- %2')
  })
})

describe('buildString — closeGaps', () => {
  // A gap-closing site is one that RENDERS empty — a bound null, or a
  // value trim reduces to "". An unbound token renders its own text and
  // is never one, which the last case below pins
  test.each([
    [
      'leading-preferred carries the punctuation case',
      'My name is {{first}} {{last}}.',
      { first: 'Carl', last: null },
      'My name is Carl.',
    ],
    [
      'a leading empty takes the run after it',
      'Dear {{title}} {{last}},',
      { title: null, last: 'Smith' },
      'Dear Smith,',
    ],
    [
      'a token opening the template takes the trailing run',
      '{{greeting}} world',
      { greeting: null },
      'world',
    ],
    [
      'line terminators close line-shaped gaps',
      'Line 1\n{{x}}\nLine 2',
      { x: null },
      'Line 1\nLine 2',
    ],
    ['nothing adjacent to take', 'a{{x}}b', { x: null }, 'ab'],
    [
      'a whitespace rule, deliberately not a punctuation one',
      'one, {{two}}, three',
      { two: null },
      'one,, three',
    ],
    ['an empty string is a site too', 'a {{x}} b', { x: '' }, 'a b'],
  ])('%s', async (_label, template, substitutions, expected) => {
    expect(await ev({ $buildString: { template, substitutions, closeGaps: true } })).toBe(expected)
  })

  test('off by default — the same template keeps its gap', async () => {
    expect(
      await ev({
        $buildString: {
          template: 'My name is {{first}} {{last}}.',
          substitutions: { first: 'Carl', last: null },
        },
      })
    ).toBe('My name is Carl .')
  })

  test('a template in which nothing renders empty is byte-identical either way', async () => {
    const template = 'a  {{x}}  b'
    const substitutions = { x: 'X' }
    expect(await ev({ $buildString: { template, substitutions, closeGaps: true } })).toBe(
      await ev({ $buildString: { template, substitutions } })
    )
  })

  test('a set nullValueDefault renders something, making the flag a no-op there', async () => {
    expect(
      await ev({
        $buildString: {
          template: 'My name is {{first}} {{last}}.',
          substitutions: { first: 'Carl', last: null },
          nullValueDefault: '?',
          closeGaps: true,
        },
      })
    ).toBe('My name is Carl ?.')
  })

  test('a value trim reduces to "" is a gap-closing site', async () => {
    expect(
      await ev({
        $buildString: {
          template: 'a {{x}} b',
          substitutions: { x: '   ' },
          trim: true,
          closeGaps: true,
        },
      })
    ).toBe('a b')
  })

  test('unbound tokens are never gap-closing sites', async () => {
    expect(
      await ev({ $buildString: { template: 'a {{x}} b', substitutions: {}, closeGaps: true } })
    ).toBe('a {{x}} b')
  })

  test('each run is consumed at most once', async () => {
    expect(
      await ev({
        $buildString: {
          template: 'a {{x}} {{y}} b',
          substitutions: { x: '', y: '' },
          closeGaps: true,
        },
      })
    ).toBe('a b')
  })
})

// ── buildString: reference tokens ───────────────────────────────────

describe('buildString — reference tokens', () => {
  test('the one-liner: a single payload, a reference token, no substitutions', async () => {
    expect(await ev({ $buildString: 'Hello, {{$d.user.first}}!' }, data)).toBe('Hello, Ada!')
  })

  test('they mix with named substitutions', async () => {
    expect(
      await ev(
        {
          $buildString: {
            template: 'Name: {{$d.user.first}} {{fetchedLast}}',
            substitutions: { fetchedLast: { $plus: ['Love', 'lace'] } },
          },
        },
        data
      )
    ).toBe('Name: Ada Lovelace')
  })

  test('a repeated reference token binds once and renders the same value', async () => {
    expect(await ev({ $buildString: '{{$d.user.first}} and {{$d.user.first}}' }, data)).toBe(
      'Ada and Ada'
    )
  })

  test('a missing reference renders "" and can close its gap', async () => {
    expect(
      await ev(
        {
          $buildString: {
            template: 'My name is {{$d.name.first}} {{$d.name.last}}.',
            closeGaps: true,
          },
        },
        { name: { first: 'Carl' } }
      )
    ).toBe('My name is Carl.')
  })

  test('$vars and iterator bindings resolve through the desugar', async () => {
    expect(await ev({ vars: { who: 'world' }, $buildString: 'Hello, {{$vars.who}}!' })).toBe(
      'Hello, world!'
    )
    expect(
      await ev({ $map: ['$data.tags', { $buildString: '{{$index}}:{{$element}}' }] }, data)
    ).toEqual(['0:red', '1:green'])
  })

  test('an as-renamed binding works too', async () => {
    expect(
      await ev(
        {
          $map: {
            input: '$data.tags',
            as: 'tag',
            each: { $buildString: 'tag {{$tag}}' },
          },
        },
        data
      )
    ).toEqual(['tag red', 'tag green'])
  })

  test('an unrecognized namespace is not a reference and renders literally', async () => {
    expect(await ev({ $buildString: 'x {{$typo.y}}' }, data)).toBe('x {{$typo.y}}')
  })

  test('a DYNAMIC template is never scanned for references — the injection path stays dead', async () => {
    expect(await ev({ $buildString: '$data.tpl' }, { ...data, tpl: 'Hi {{$d.user.first}}' })).toBe(
      'Hi {{$d.user.first}}'
    )
  })

  test('beside positional substitutions a reference token is inert, and warned', async () => {
    expect(await ev({ $buildString: ['%1 {{$d.user.first}}', 'x'] }, data)).toBe(
      'x {{$d.user.first}}'
    )
    expect(codes({ $buildString: ['%1 {{$d.user.first}}', 'x'] })).toContain(
      'inert-reference-token'
    )
  })

  test('beside a dynamic map likewise', async () => {
    expect(
      codes({ $buildString: { template: '{{$d.a}}', substitutions: '$data.subs' } })
    ).toContain('inert-reference-token')
  })

  test('a reference token contributes its path as a dependency', () => {
    const result = fig.validate({ $buildString: 'Hi {{$d.user.absent}}' }, { data: {} })
    expect(result.issues.map((issue) => issue.code)).toContain('missing-data-path')
  })
})

// ── buildString: the literal-face findings ──────────────────────────

describe('buildString — literal-face findings are warnings, never errors', () => {
  test('an unbound positional token warns and still evaluates', () => {
    const result = fig.validate({ $buildString: ['My %1 is %3', 'name', 'Smith'] })
    expect(result.valid).toBe(true)
    expect(result.issues.map((issue) => issue.code)).toContain('unbound-token')
    expect(result.issues.map((issue) => issue.code)).toContain('token-renumber')
  })

  test('a repeated token with a spare substitution is not a renumbering slip', () => {
    const result = fig.validate({ $buildString: ['%1 and %1', 'a', 'b'] })
    expect(result.valid).toBe(true)
    expect(result.issues.map((issue) => issue.code)).toEqual(['unused-substitution'])
  })

  test('an unbound named token warns', () => {
    expect(
      codes({
        $buildString: { template: 'Hi {{first}} {{last}}', substitutions: { first: 'Carl' } },
      })
    ).toContain('unbound-token')
  })

  test('%0 can never bind, so it warns', () => {
    expect(codes({ $buildString: ['%0', 'x'] })).toContain('unbound-token')
  })

  test('an unused literal substitution warns', () => {
    expect(codes({ $buildString: ['%1', 'used', 'spare'] })).toContain('unused-substitution')
    expect(codes({ $buildString: { template: '{{a}}', substitutions: { a: 1, b: 2 } } })).toContain(
      'unused-substitution'
    )
  })

  test('a percent-encoded URL draws no unbound warning it cannot act on', () => {
    // %20 IS unbound, so it warns — but the expression still evaluates,
    // which is the whole reason these are warnings
    const result = fig.validate({ $buildString: ['https://x.test/?q=%20foo', 'a'] })
    expect(result.valid).toBe(true)
  })

  test('cross-style tokens draw nothing — they are deliberately inert', () => {
    expect(
      codes({ $buildString: { template: '%1 {{a}}', substitutions: { a: 1 } } })
    ).not.toContain('unbound-token')
  })

  test('a dynamic face is not linted at all', () => {
    expect(
      codes({ $buildString: { template: 'Hi {{x}}', substitutions: '$data.subs' } })
    ).not.toContain('unbound-token')
  })
})

// ── join ────────────────────────────────────────────────────────────

describe('join', () => {
  test('the flat literal list — the everyday positional face', async () => {
    expect(await ev({ $join: ['$data.user.first', 'Lovelace'] }, data)).toBe('Ada Lovelace')
  })

  test('a whole array arrives dynamically', async () => {
    expect(await ev({ $join: '$data.tags' }, data)).toBe('red green')
  })

  test('the delimiter is named-face only, and operatorDefaults-friendly', async () => {
    expect(await ev({ $join: { values: '$data.tags', delimiter: ', ' } }, data)).toBe('red, green')
    const comma = new FigTree({ operatorDefaults: { join: { delimiter: ', ' } } })
    expect(await comma.evaluate({ $join: '$data.tags' }, { data })).toBe('red, green')
  })

  test('row 22: the positional face is rest-only, so a trailing delimiter is an element', async () => {
    expect(await ev({ $join: ['$data.tags', ', '] }, data)).toBe('<array> , ')
  })

  test('row 18: a null element renders "" and keeps its slot and delimiter', async () => {
    expect(
      await ev({ $join: { values: ['123 Main St', null, 'Springfield'], delimiter: ', ' } })
    ).toBe('123 Main St, , Springfield')
  })

  test('nullValueDefault fills the slot instead', async () => {
    expect(
      await ev({ $join: { values: ['a', null, 'c'], delimiter: ',', nullValueDefault: '-' } })
    ).toBe('a,-,c')
  })

  test('the skip reading is one filter away', async () => {
    expect(
      await ev({
        $join: {
          values: { $filter: [['a', null, 'c'], { $notEqual: ['$element', null] }] },
          delimiter: ', ',
        },
      })
    ).toBe('a, c')
  })

  test('row 19: empty input is the vacuous render', async () => {
    expect(await ev({ $join: '$data.none' }, { none: [] })).toBe('')
  })

  test('the result is always a string', async () => {
    expect(await ev({ $join: [42] })).toBe('42')
  })

  test('delimiter: "" is the honest spelling of pure concatenation', async () => {
    expect(await ev({ $join: { values: ['a', 1], delimiter: '' } })).toBe('a1')
  })

  test('the contrast with plus: plus concatenates operands strictly', async () => {
    expect((await failure({ $plus: ['a', 1] })).code).toBe('type-check')
  })

  test('a whole-null values is a type error, not a propagated null', async () => {
    expect((await failure({ $join: '$data.nope' }, data)).code).toBe('type-check')
  })

  test('composites render their placeholder at runtime', async () => {
    expect(
      await ev({ $join: { values: '$data.mixed', delimiter: '|' } }, { mixed: [{ a: 1 }, [2]] })
    ).toBe('<object>|<array>')
  })

  test('a literal empty list is a dead expression, warned', () => {
    const result = fig.validate({ $join: [] })
    expect(result.valid).toBe(true)
    expect(result.issues.map((issue) => issue.severity)).toEqual(['warning'])
  })

  test('a statically-composite literal element is an error — it can only ever be a placeholder', () => {
    const result = fig.validate({ $join: [{ a: 1 }, 'x'] })
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('operator-validate')
  })

  test('the idiomatic pipeline: extract, then render', async () => {
    expect(
      await ev(
        { $join: { values: { $map: ['$data.items', '$element.name'] }, delimiter: ', ' } },
        { items: [{ name: 'a' }, { name: 'b' }] }
      )
    ).toBe('a, b')
  })
})
