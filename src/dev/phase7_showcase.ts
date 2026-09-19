/**
 * Phase 7 showcase — `pnpm dev phase7_showcase`. The remaining core
 * operators, and with them the core-complete milestone: `get` and
 * `buildObject` (data & objects), `buildString`, `join` and `regex` (the
 * renderers and patterns), plus `literal`, which is grammar rather than a
 * definition. Every phase closes with one of these (implementation-plan
 * working rule 7).
 *
 * The thread running through the phase is the disruption gradient: almost
 * nothing here fails. A missing path is null, an unbound token renders
 * its own text, a composite renders a placeholder, a no-match is an
 * answer. Each section shows the quiet runtime behaviour first and then,
 * at the end, what `validate()` had to say about the same expression at
 * authoring time — which is where the loudness lives.
 */
import { FigTree } from '../index'
import { coreOperators } from '../operators'
import { outcome, print, section } from './showcase'

const data = {
  user: { first: 'Ada', last: null, id: 42, email: 'ada@example.com' },
  name: { first: 'Carl' },
  org: { name: 'The Avengers', category: 'Superheroes' },
  weapons: [
    { name: 'Blaster', power: 3 },
    { name: 'Seismic charge', power: 9 },
  ],
  addressLines: ['123 Main St', null, 'Springfield'],
  tags: ['red', 'green', 'blue'],
  chosen: 'org.name',
  weight: '15 grams',
  partialName: { first: 'Carl' },
  'exotic.key': 'reachable only through a quoted segment',
}

const fig = new FigTree({ operators: [coreOperators], data })

const show = async (
  label: string,
  expression: unknown,
  options: Parameters<FigTree['evaluate']>[1] = {}
) => print(label, expression, await outcome(() => fig.evaluate(expression, options)))

const lint = (label: string, expression: unknown) => {
  const issues = fig
    .validate(expression)
    .issues.map((issue) => `${issue.severity} ${issue.code}`)
    .join(', ')
  print(label, expression, `⚑ ${issues === '' ? 'no issues' : issues}`)
}

const main = async () => {
  section('get — the reference layer wearing parameters')
  await show('the sugar contract: this is exactly "$data.org.name"', { $get: 'org.name' })
  await show('…which a bare reference spells more briefly', '$data.org.name')
  await show('the point of the operator: a path that arrives as data', { $get: '$data.chosen' })
  await show('a missing path is null — absence is not failure', { $get: 'user.middleName' })
  await show('missingPathDefault answers instead', { $get: ['user.middleName', 'N/A'] })
  await show('…but a STORED null passes through untouched', { $get: ['user.last', 'N/A'] })
  await show('a quoted segment reaches a key a reference cannot spell', {
    $get: '["exotic.key"]',
  })
  await show('segments as an array: strings are keys verbatim, numbers index', {
    $get: { path: ['weapons', 1, 'name'] },
  })
  await show('[*] projects the rest of the path over an array', { $get: 'weapons[*].name' })
  await show('from REPLACES the data, never merges with it', {
    $get: { path: 'name', from: '$data.org' },
  })
  await show('…so a null source is one where every path is missing', {
    $get: { path: 'name', from: '$data.absent', missingPathDefault: 'Anonymous' },
  })
  await show('and drilling into a node result is what `from` is really for', {
    $get: {
      path: 'name',
      from: { $find: ['$data.weapons', { $greaterThan: ['$element.power', 5] }] },
    },
  })

  section('buildString — the renderer')
  await show('the one-liner: a reference token, no substitutions at all', {
    $buildString: 'Hello, {{$d.user.first}}!',
  })
  await show('the positional face', {
    $buildString: ['%1 has %2 tags', '$data.user.first', { $length: '$data.tags' }],
  })
  await show('the named face', {
    $buildString: {
      template: 'Dear {{first}} {{last}}',
      substitutions: { first: '$data.user.first', last: 'Lovelace' },
    },
  })
  await show('a null renders "" — deliberate absence renders as nothing', {
    $buildString: ['%1 %2', '$data.user.first', '$data.user.last'],
  })
  await show('closeGaps swallows the space the empty render left behind', {
    $buildString: {
      template: 'My name is {{$d.name.first}} {{$d.name.last}}.',
      closeGaps: true,
    },
  })
  await show('nullValueDefault is the other opt-out', {
    $buildString: {
      template: 'Name: {{first}} {{last}}',
      substitutions: { first: '$data.user.first', last: '$data.user.last' },
      nullValueDefault: '(unknown)',
    },
  })
  await show('an unbound token renders its own text — visible, never silent', {
    $buildString: { template: 'Hi {{first}} {{last}}', substitutions: '$data.partialName' },
  })
  await show('%N is a strict index, so a skipped number stays visible', {
    $buildString: ['My %1 is %3', 'name', 'Smith'],
  })
  await show('a percent-encoded URL needs no escaping — %20 is simply unbound', {
    $buildString: ['https://x.test/search?q=%20%1', '$data.tags'],
  })
  await show('…and a composite in a text position says so', {
    $buildString: ['Your tags: %1', '$data.tags'],
  })
  await show('a value is never re-scanned, so data cannot expand into tokens', {
    $buildString: { template: 'Bio: {{bio}}', substitutions: { bio: 'call me {{$d.user.email}}' } },
  })
  await show('a dynamic template propagates null, and firstOf composes over it', {
    $firstOf: [
      { $buildString: ['$data.i18n.greeting', '$data.user.first'] },
      { $buildString: ['Hello, %1!', '$data.user.first'] },
    ],
  })

  section('join — buildString’s list-shaped sibling')
  await show('the flat literal list', { $join: ['$data.user.first', 'Lovelace'] })
  await show('a whole array, with a delimiter', {
    $join: { values: '$data.tags', delimiter: ', ' },
  })
  await show('a null element keeps its slot — a CSV column must not shift', {
    $join: { values: '$data.addressLines', delimiter: ', ' },
  })
  await show('…and the skip reading is one filter away', {
    $join: {
      values: { $filter: ['$data.addressLines', { $notEqual: ['$element', null] }] },
      delimiter: ', ',
    },
  })
  await show('the idiomatic pipeline: extract, then render', {
    $join: { values: { $map: ['$data.weapons', '$element.name'] }, delimiter: ' and ' },
  })
  await show('the rest face is rest-only, so a trailing delimiter is an ELEMENT', {
    $join: ['$data.tags', ', '],
  })

  section('regex — three result modes, one signature')
  await show('test is the default, and reads well in condition position', {
    $regex: ['$data.user.email', '^[^@]+@[^@]+\\.[^@]+$'],
  })
  await show('extract pulls the first match out', {
    $regex: { value: '$data.weight', pattern: '\\d+(\\.\\d+)?', mode: 'extract' },
  })
  await show('…and extract + convert is the sanctioned number-mining pipeline', {
    $convert: {
      value: { $regex: { value: '$data.weight', pattern: '\\d+(\\.\\d+)?', mode: 'extract' } },
      to: 'number',
    },
  })
  await show('no match is an answer, not a failure', {
    $regex: { value: 'no digits here', pattern: '\\d+', mode: 'extract' },
  })
  await show('…or noMatchDefault, if absence should read as something', {
    $regex: { value: 'no digits here', pattern: '\\d+', mode: 'extract', noMatchDefault: 0 },
  })
  await show('match returns every one of them, in order', {
    $regex: { value: 'a1 b22 c333', pattern: '\\d+', mode: 'match' },
  })

  section('buildObject — for keys known only at runtime')
  await show('keys computed from data', {
    $buildObject: [{ key: '$data.org.category', value: '$data.org.name' }],
  })
  await show('a null value KEEPS its key — null is a value occupying its slot', {
    $buildObject: [{ key: 'phone', value: '$data.user.phone' }],
  })
  await show('…and the drop idiom is a filter, as it was for join', {
    $buildObject: {
      entries: {
        $filter: [
          [
            { key: 'id', value: '$data.user.id' },
            { key: 'phone', value: '$data.user.phone' },
          ],
          { $notEqual: ['$element.value', null] },
        ],
      },
    },
  })
  await show('the sanctioned escape for output that must CONTAIN reserved words', {
    $buildObject: [{ key: 'operator', value: 'this is data, not a node' }],
  })
  await show(
    'a malformed entry is a type error where v2 silently dropped it',
    {
      $buildObject: '$data.notEntries',
    },
    { data: { ...data, notEntries: [{ value: 'no key' }] } }
  )

  section('literal — the parse boundary')
  await show('an expression quoted as OUTPUT, never evaluated', {
    $literal: { operator: 'plus', values: [1, 2, 3] },
  })
  await show('once quoted, quoted forever — no enclosing node can re-capture it', {
    $map: [[1], { $literal: { $match: { status: 'open' } } }],
  })
  await show('inside the quote, $ keys and // are ordinary data', {
    $literal: { '//': 'not a comment', $data: 'not a reference' },
  })

  section('what validate() says before any of it runs')
  lint('an unbound token — a warning, so the expression still evaluates', {
    $buildString: ['My %1 is %3', 'name', 'Smith'],
  })
  lint('a surplus literal substitution the template never names', {
    $buildString: ['%1', 'used', 'spare'],
  })
  lint('a reference token beside positional substitutions cannot be recognized', {
    $buildString: ['%1 {{$d.user.first}}', 'x'],
  })
  lint('a pattern that does not compile — an error, caught at authoring', {
    $regex: ['x', '(['],
  })
  lint('…and a flag v3 refuses, with the remedy in the message', {
    $regex: { value: 'x', pattern: 'x', flags: 'g' },
  })
  lint('a malformed literal get path', { $get: 'a[' })
  lint('duplicate literal keys — last wins, and the earlier one is dead', {
    $buildObject: [
      { key: 'k', value: 1 },
      { key: 'k', value: 2 },
    ],
  })
  lint('a composite that can only ever render as a placeholder', { $join: [{ a: 1 }, 'x'] })
  lint('every modifier on literal is dead', { $literal: 1, fallback: 'never' })
  lint('and the sample-data check reaches get paths too', { $get: 'user.middleName' })
}

void main()
