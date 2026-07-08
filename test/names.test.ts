/**
 * The shared name-legality rule and reservation sets ("Name legality, not
 * name style" and "The reserved-key set" in docs-dev/v3-specs/v3-api.md).
 * White-box: `names.ts` is internal vocabulary, not barrel surface.
 */
import {
  checkNameLegality,
  RESERVED_NODE_KEYS,
  RESERVED_REGISTRATION_NAMES,
} from '../src/names'

describe('checkNameLegality — the one rule', () => {
  it('accepts any non-empty string without . [ ] or a leading $', () => {
    expect(checkNameLegality('foo').ok).toBe(true)
    expect(checkNameLegality('camelCase').ok).toBe(true)
    expect(checkNameLegality('kebab-case').ok).toBe(true)
    expect(checkNameLegality('with spaces').ok).toBe(true)
    expect(checkNameLegality('ünïcode名前').ok).toBe(true)
    expect(checkNameLegality('99').ok).toBe(true)
    expect(checkNameLegality('+').ok).toBe(true)
    // Interior $ is fine — only the leading sigil is excluded
    expect(checkNameLegality('us$d').ok).toBe(true)
  })

  it('rejects the empty string, path characters, and a leading $', () => {
    expect(checkNameLegality('').ok).toBe(false)
    expect(checkNameLegality('a.b').ok).toBe(false)
    expect(checkNameLegality('a[0').ok).toBe(false)
    expect(checkNameLegality('a]').ok).toBe(false)
    expect(checkNameLegality('$a').ok).toBe(false)
    expect(checkNameLegality('$').ok).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(checkNameLegality(5).ok).toBe(false)
    expect(checkNameLegality(null).ok).toBe(false)
    expect(checkNameLegality(undefined).ok).toBe(false)
  })

  it('reports a reason on failure', () => {
    const result = checkNameLegality('$a')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/\$/)
  })

  it('legality is not reservation — reserved words pass the legality rule', () => {
    // Reservation is a separate check against the sets below
    expect(checkNameLegality('data').ok).toBe(true)
    expect(checkNameLegality('fallback').ok).toBe(true)
  })
})

describe('the reservation sets', () => {
  it('RESERVED_NODE_KEYS is exactly the seven reserved node keys', () => {
    expect([...RESERVED_NODE_KEYS].sort()).toEqual(
      ['operator', 'fragment', 'parameters', 'fallback', 'useCache', 'vars', '//'].sort()
    )
  })

  it('RESERVED_REGISTRATION_NAMES covers node keys, namespaces, short forms and literal', () => {
    // The seven node keys are barred as registration names too
    for (const key of RESERVED_NODE_KEYS) {
      expect(RESERVED_REGISTRATION_NAMES.has(key)).toBe(true)
    }
    // Reference namespaces and their single-character alias forms
    for (const word of ['data', 'vars', 'params', 'element', 'index', 'd', 'v', 'p', 'e', 'i']) {
      expect(RESERVED_REGISTRATION_NAMES.has(word)).toBe(true)
    }
    expect(RESERVED_REGISTRATION_NAMES.has('literal')).toBe(true)
  })

  it('reservation is case-sensitive — only the exact words are reserved', () => {
    expect(RESERVED_REGISTRATION_NAMES.has('Data')).toBe(false)
    expect(RESERVED_NODE_KEYS.has('Fallback')).toBe(false)
  })

  it('ordinary operator names are not reserved', () => {
    expect(RESERVED_REGISTRATION_NAMES.has('plus')).toBe(false)
    expect(RESERVED_REGISTRATION_NAMES.has('if')).toBe(false)
  })
})
