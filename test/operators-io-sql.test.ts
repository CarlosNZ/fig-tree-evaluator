/**
 * Chunk 9.3 — `sql` ("Batch 8 — I/O" in
 * docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * Hand-migrated from test/v2-working/12_database.test.ts, whose `single` ×
 * `flatten` matrix becomes the one `shape` union — and whose runtime magic
 * it deliberately loses: v2 returned scalars or arrays depending on how
 * many columns happened to arrive, so the same expression changed shape
 * with the query. Here a multi-column result under a single-column shape
 * is an error.
 *
 * Register row 29 is discharged here.
 */
import { FigTree, FigTreeError, coreOperators, sqlOperators } from '../src'
import type { ValidatedOperatorDefinition } from '../src'
import { MockSqlConnection } from './helpers'
import { spyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

const PEOPLE = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
]
const NAMES = [{ name: 'Ada' }, { name: 'Grace' }]

const withDb = (db: MockSqlConnection, extra: ValidatedOperatorDefinition[] = []) =>
  new FigTree({ operators: [coreOperators, sqlOperators(db), ...extra] })

const db = (rows: Record<string, unknown>[] = PEOPLE) =>
  new MockSqlConnection({ defaultRows: rows })

describe('the call', () => {
  it('takes the query and its binds positionally — v2’s own children shape', async () => {
    const connection = db()
    await withDb(connection).evaluate(
      { $sql: ['SELECT * FROM people WHERE id = $1', '$data.id'] },
      { data: { id: 7 } }
    )
    expect(connection.calls[0]).toEqual({
      text: 'SELECT * FROM people WHERE id = $1',
      values: [7],
    })
  })

  it('omits values entirely when there are none, however they were spelled', async () => {
    const connection = db()
    const fig = withDb(connection)
    await fig.evaluate({ $sql: ['SELECT 1'] })
    expect(connection.calls[0]).toEqual({ text: 'SELECT 1' })

    // The named face leaves `values` absent where the rest slice binds an
    // empty array — the same request, so it must not fork the cache key
    await fig.evaluate({ $sql: { query: 'SELECT 1' } })
    expect(connection.queryCount).toBe(1)
  })

  it('binds a null as SQL NULL rather than dropping it', async () => {
    const connection = db()
    await withDb(connection).evaluate(
      { $sql: ['SELECT * FROM people WHERE deleted = $1', '$data.gone'] },
      { data: {} }
    )
    expect(connection.calls[0].values).toEqual([null])
  })
})

describe('shape', () => {
  it('rows — every row object, the default', async () => {
    expect(await withDb(db()).evaluate({ $sql: ['SELECT * FROM people'] })).toEqual(PEOPLE)
  })

  it('firstRow — the first row object', async () => {
    expect(
      await withDb(db()).evaluate({ $sql: { query: 'SELECT * FROM people', shape: 'firstRow' } })
    ).toEqual({ id: 1, name: 'Ada' })
  })

  it('column — one column’s values', async () => {
    expect(
      await withDb(db(NAMES)).evaluate({
        $sql: { query: 'SELECT name FROM people', shape: 'column' },
      })
    ).toEqual(['Ada', 'Grace'])
  })

  it('firstValue — one scalar', async () => {
    expect(
      await withDb(db(NAMES)).evaluate({
        query: 'SELECT name FROM people LIMIT 1',
        operator: 'sql',
        shape: 'firstValue',
      })
    ).toBe('Ada')
  })

  it('takes the first row under the singular shapes, no error — queryOne semantics', async () => {
    const fig = withDb(db(NAMES))
    expect(
      await fig.evaluate({ $sql: { query: 'SELECT name FROM people', shape: 'firstValue' } })
    ).toBe('Ada')
  })

  it('refuses a multi-column result under the single-column shapes', async () => {
    const fig = withDb(db(PEOPLE))
    for (const shape of ['column', 'firstValue']) {
      const error = await rejection<FigTreeError>(
        fig.evaluate({ $sql: { query: `SELECT * FROM people -- ${shape}`, shape } })
      )
      expect(error.code).toBe('type-check')
      expect(error.message).toMatch(/needs one column/)
    }
  })

  describe('a connection that breaks the rows-as-objects contract', () => {
    const SHAPES = ['rows', 'firstRow', 'column', 'firstValue']
    const counting = (answer: unknown) => {
      const connection = {
        queries: 0,
        query: async () => {
          connection.queries++
          return answer as never
        },
      }
      return connection
    }
    const broken: [string, unknown, RegExp][] = [
      // pg's `rowMode: 'array'`
      ['rows as arrays', [['Ada'], ['Grace']], /each row .* must be an object, received array/],
      // pg's whole result, not its `rows`: unchecked, 'firstRow' read it as
      // no row at all
      ['a driver result object', { rows: NAMES, rowCount: 2 }, /an array of rows, received object/],
      ['null', null, /an array of rows, received null/],
      ['a null row', [null, { name: 'Grace' }], /each row .* must be an object, received null/],
    ]

    it.each(broken)(
      'fails %s as request-failure, whatever the shape',
      async (_, answer, message) => {
        const fig = new FigTree({ operators: [coreOperators, sqlOperators(counting(answer))] })
        for (const shape of SHAPES) {
          const error = await rejection<FigTreeError>(
            fig.evaluate({ $sql: { query: 'SELECT name FROM people', shape } })
          )
          expect(error.code).toBe('request-failure')
          expect(error.message).toMatch(message)
        }
      }
    )

    it('never caches the broken answer', async () => {
      const connection = counting([['Ada']])
      const fig = new FigTree({ operators: [coreOperators, sqlOperators(connection)] })
      await rejection(fig.evaluate({ $sql: 'SELECT name FROM people' }))
      await rejection(fig.evaluate({ $sql: 'SELECT name FROM people' }))
      expect(connection.queries).toBe(2)
    })

    it('takes any object as a row: node:sqlite’s have a null prototype', async () => {
      class Row {
        name = 'Grace'
      }
      const rows = [Object.assign(Object.create(null), { name: 'Ada' }), new Row()]
      const fig = new FigTree({ operators: [coreOperators, sqlOperators(counting(rows))] })
      expect(
        await fig.evaluate({ $sql: { query: 'SELECT name FROM people', shape: 'column' } })
      ).toEqual(['Ada', 'Grace'])
    })
  })

  it('validates a literal shape at authoring time', () => {
    const report = withDb(db()).validate({ $sql: { query: 'SELECT 1', shape: 'row' } })
    expect(report.valid).toBe(false)
  })
})

describe('an empty result — register row 29', () => {
  it('answers with the empty collection under rows and column', async () => {
    const fig = withDb(db([]))
    expect(await fig.evaluate({ $sql: ['SELECT 1 WHERE false'] })).toEqual([])
    expect(
      await fig.evaluate({ $sql: { query: 'SELECT a WHERE false', shape: 'column' } })
    ).toEqual([])
  })

  it('answers null under the singular shapes — absence, not failure', async () => {
    const fig = withDb(db([]))
    expect(
      await fig.evaluate({ $sql: { query: 'SELECT 1 WHERE false', shape: 'firstRow' } })
    ).toBeNull()
    expect(
      await fig.evaluate({ $sql: { query: 'SELECT 1 WHERE false', shape: 'firstValue' } })
    ).toBeNull()
  })

  it('answers noRowDefault instead, when one is supplied', async () => {
    expect(
      await withDb(db([])).evaluate({
        $sql: { query: 'SELECT 1 WHERE false', shape: 'firstValue', noRowDefault: 'none' },
      })
    ).toBe('none')
  })

  it('never fires noRowDefault under rows or column', async () => {
    expect(
      await withDb(db([])).evaluate({
        $sql: { query: 'SELECT 1 WHERE false', shape: 'rows', noRowDefault: 'none' },
      })
    ).toEqual([])
  })

  it('never evaluates noRowDefault when a row was found — it is lazy', async () => {
    const spy = spyOp('expensive', {})
    const fig = withDb(db(NAMES), [spy.definition])
    expect(
      await fig.evaluate({
        $sql: {
          query: 'SELECT name FROM people',
          shape: 'firstValue',
          noRowDefault: { $expensive: {} },
        },
      })
    ).toBe('Ada')
    expect(spy.calls).toHaveLength(0)
  })

  it('never fires on a genuine failure — that is fallback’s job', async () => {
    const connection = new MockSqlConnection({ fail: true, failMessage: 'connection refused' })
    const error = await rejection<FigTreeError>(
      withDb(connection).evaluate({
        $sql: { query: 'SELECT 1', shape: 'firstValue', noRowDefault: 'none' },
      })
    )
    expect(error.message).toMatch(/connection refused/)
  })
})

describe('the read contract is documentation, not a lint', () => {
  it('does not warn on a write verb — a read-only role is the real guard', () => {
    // Considered and dropped (Carl, September 2026): mutating POSTs are
    // equally reachable and equally unlintable, so singling out SQL would
    // be inconsistent. The description carries the guidance instead
    const report = withDb(db()).validate({ $sql: ['UPDATE jobs SET run = now()'] })
    expect(report.issues).toEqual([])
  })
})
