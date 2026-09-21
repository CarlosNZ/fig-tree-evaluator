/**
 * Chunk 13.1 — `fig.getFragments()` ("Introspection & housekeeping
 * methods" in docs-dev/v3-specs/v3-evaluator-methods.md; the content
 * requirement in the Fragments area of docs-dev/v3-specs/v3-api.md).
 *
 * The declaration surface, never the body. The two additions settled at
 * Phase-13 planning carry most of the weight here: the warnings a body
 * raised at registration, which have no other channel, and its dependency
 * rollup, which nothing else on the public surface can answer once the
 * body is withheld.
 */
import { FigTree, coreOperators } from '../src'
import type { FragmentDefinition, FragmentInfo } from '../src'

const bag = { colour: 'host-owned' }

const fragments: Record<string, FragmentDefinition> = {
  greeting: {
    expression: { $buildString: ['Hello, %1', '$params.name'] },
    parameters: {
      name: { type: 'string', description: 'Who to greet' },
      loud: { type: 'boolean', default: false },
    },
    description: 'A greeting',
    metadata: bag,
  },
  // A body whose `$` key resolves to nothing: inert data plus a warning,
  // and registration has no other way to report it
  sloppy: { expression: { $flibble: 'inert' } },
  inner: { expression: { $get: 'settings.theme' } },
  outer: { expression: { $plus: [{ fragment: 'inner' }, '$data.count'] } },
}

const fig = new FigTree({ operators: [coreOperators], fragments })

const find = (name: string): FragmentInfo => {
  const info = fig.getFragments().find((entry) => entry.name === name)
  if (info === undefined) throw new Error(`no snapshot entry for '${name}'`)
  return info
}

describe('what the snapshot contains', () => {
  test('one entry per fragment, in registration order', () => {
    expect(fig.getFragments().map((entry) => entry.name)).toEqual([
      'greeting',
      'sloppy',
      'inner',
      'outer',
    ])
  })

  test('declarations carry effective optionality and defaults', () => {
    expect(find('greeting').parameters).toEqual({
      name: { type: 'string', required: true, description: 'Who to greet' },
      loud: { type: 'boolean', required: false, default: false },
    })
  })

  test('description and the metadata bag travel, the bag by identity', () => {
    expect(find('greeting').description).toBe('A greeting')
    expect(find('greeting').metadata).toBe(bag)
  })

  test('the body’s registration warnings are reported', () => {
    const [warning] = find('sloppy').warnings
    expect(warning).toMatchObject({ severity: 'warning' })
    expect(warning.message).toContain('$flibble')
    expect(find('greeting').warnings).toEqual([])
  })

  test('the dependency rollup is the public shape, and transitive', () => {
    expect(find('outer').dependencies).toEqual({
      data: { paths: ['count', 'settings.theme'], dynamic: false },
      operators: ['plus', 'get'],
      fragments: ['inner'],
    })
  })
})

describe('what the snapshot withholds', () => {
  test('the body, and the internal limit rollups', () => {
    const info = find('outer')
    expect('expression' in info).toBe(false)
    expect('body' in info).toBe(false)
    expect('nodeCount' in info).toBe(false)
    expect('maxDepth' in info).toBe(false)
  })

  test('no instance* keys — operatorDefaults cannot name a fragment', () => {
    expect(Object.keys(find('greeting')).some((key) => key.startsWith('instance'))).toBe(false)
  })
})

describe('copy posture', () => {
  test('a fresh array and fresh objects every call', () => {
    expect(fig.getFragments()).not.toBe(fig.getFragments())
    expect(find('greeting').parameters.name).not.toBe(find('greeting').parameters.name)
  })

  test('mutating the snapshot cannot reach the registry', () => {
    const info = find('greeting')
    info.description = 'clobbered'
    info.parameters.name.required = false
    info.warnings.push({ severity: 'error', code: 'injected', message: 'x', path: [] })
    expect(find('greeting').description).toBe('A greeting')
    expect(find('greeting').parameters.name.required).toBe(true)
    expect(find('greeting').warnings).toEqual([])
  })

  test('nor can mutating a warning inside it — the issues are frozen', () => {
    const [warning] = find('sloppy').warnings
    const { message } = warning
    expect(() => {
      warning.message = 'clobbered'
    }).toThrow(TypeError)
    expect(() => {
      warning.path.push('x')
    }).toThrow(TypeError)
    expect(find('sloppy').warnings[0].message).toBe(message)
  })
})
