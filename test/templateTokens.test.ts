/**
 * Chunk 7.2 — the `buildString` token grammar (batch 4 in
 * docs-dev/v3-specs/v3-operator-parameters.md). A unit suite over the one
 * scanner both the compiler and the operator body consume; the rendering
 * rules built on top of it are asserted in test/operators-renderers.test.ts.
 */
import { scanTemplate } from '../src/templateTokens'

const shape = (template: string) =>
  scanTemplate(template).map((segment) =>
    segment.kind === 'text' ? segment.text : `<${segment.kind}:${segment.raw}>`
  )

describe('positional %N', () => {
  test('digits are greedy — %12 is token twelve', () => {
    expect(scanTemplate('%12')).toEqual([{ kind: 'positional', raw: '%12', index: 12 }])
  })

  test('a % not followed by digits is plain text', () => {
    expect(shape('20% off')).toEqual(['20% off'])
    expect(shape('100%')).toEqual(['100%'])
  })

  test('%0 is a token, and one that can never bind', () => {
    expect(scanTemplate('%0')).toEqual([{ kind: 'positional', raw: '%0', index: 0 }])
  })

  test('repeats are separate sites naming the same substitution', () => {
    expect(shape('%1 and %1')).toEqual(['<positional:%1>', ' and ', '<positional:%1>'])
  })

  test('a percent-encoded URL scans as a token and keeps its text', () => {
    expect(shape('?q=%20foo')).toEqual(['?q=', '<positional:%20>', 'foo'])
  })
})

describe('named {{…}}', () => {
  test('a plain identifier is a token', () => {
    expect(scanTemplate('{{name}}')).toEqual([{ kind: 'named', raw: '{{name}}', body: 'name' }])
  })

  test('a reference-shaped body is a token too', () => {
    expect(scanTemplate('{{$d.user.name}}')).toEqual([
      { kind: 'named', raw: '{{$d.user.name}}', body: '$d.user.name' },
    ])
  })

  test('bare path drilling is not a token — v2 dies here', () => {
    expect(shape('{{user.name}}')).toEqual(['{{user.name}}'])
    expect(shape('{{friends[0]}}')).toEqual(['{{friends[0]}}'])
  })

  test('an empty body is not a token', () => {
    expect(shape('{{}}')).toEqual(['{{}}'])
  })

  test('an unclosed {{ is text, and a later token still binds', () => {
    expect(shape('{{ and {{name}}')).toEqual(['{{ and ', '<named:{{name}}>'])
  })

  test('the near-miss {{ name }} is a token whose body has the spaces in it', () => {
    // Legal by the shared name rule (spaces are legal in names), so it is
    // well-formed — and unbound against a key spelled `name`
    expect(scanTemplate('{{ name }}')[0]).toEqual({
      kind: 'named',
      raw: '{{ name }}',
      body: ' name ',
    })
  })
})

describe('mixing and text', () => {
  test('adjacent text merges into one segment', () => {
    expect(shape('a b c')).toEqual(['a b c'])
  })

  test('both styles scan in one pass — the mode decides which binds', () => {
    expect(shape('%1 {{two}}')).toEqual(['<positional:%1>', ' ', '<named:{{two}}>'])
  })

  test('an empty template scans to nothing', () => {
    expect(scanTemplate('')).toEqual([])
  })

  test('a template with no tokens is one text segment', () => {
    expect(scanTemplate('Hello')).toEqual([{ kind: 'text', text: 'Hello' }])
  })
})
