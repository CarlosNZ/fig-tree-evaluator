import { FigTreeError, isFigTreeError, ErrorCodes } from '../src'

describe('FigTreeError', () => {
  it('is an Error with name "FigTreeError" and the required fields', () => {
    const err = new FigTreeError({
      code: ErrorCodes.typeCheck,
      message: 'bad input',
      path: ['a', 0, 'b'],
    })

    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(FigTreeError)
    expect(err.name).toBe('FigTreeError')
    expect(err.message).toBe('bad input')
    expect(err.code).toBe('type-check')
    expect(err.path).toEqual(['a', 0, 'b'])
  })

  it('round-trips every optional field', () => {
    const inner = new FigTreeError({ code: ErrorCodes.operatorFailure, message: 'inner', path: [] })
    const err = new FigTreeError({
      code: ErrorCodes.operatorFailure,
      message: 'outer',
      path: ['call'],
      holePath: ['hole'],
      operator: 'http',
      fragment: 'greet',
      fragmentPath: ['body', 'x'],
      errorData: { status: 500 },
      related: [inner],
      cause: inner,
      issues: [{ severity: 'error', code: ErrorCodes.typeCheck, message: 'm', path: [] }],
      trace: { some: 'tree' },
    })

    expect(err.holePath).toEqual(['hole'])
    expect(err.operator).toBe('http')
    expect(err.fragment).toBe('greet')
    expect(err.fragmentPath).toEqual(['body', 'x'])
    expect(err.errorData).toEqual({ status: 500 })
    expect(err.related).toEqual([inner])
    expect(err.cause).toBe(inner)
    expect(err.issues).toHaveLength(1)
    expect(err.trace).toEqual({ some: 'tree' })
  })

  it('leaves unset optional fields undefined', () => {
    const err = new FigTreeError({ code: ErrorCodes.timeout, message: 'timed out', path: [] })
    expect(err.holePath).toBeUndefined()
    expect(err.operator).toBeUndefined()
    expect(err.errorData).toBeUndefined()
    expect(err.related).toBeUndefined()
  })

  describe('prettyPrint()', () => {
    it('includes the code, operator, authored path and message', () => {
      const err = new FigTreeError({
        code: ErrorCodes.typeCheck,
        message: 'expected number',
        path: ['users', 0, 'age'],
        operator: 'plus',
      })
      const out = err.prettyPrint()
      expect(out).toContain('type-check')
      expect(out).toContain('operator: plus')
      expect(out).toContain('users[0].age')
      expect(out).toContain('expected number')
    })

    it('renders errorData as JSON but suppresses it when empty', () => {
      const withData = new FigTreeError({
        code: ErrorCodes.operatorFailure,
        message: 'boom',
        path: [],
        errorData: { status: 503 },
      })
      expect(withData.prettyPrint()).toContain('"status": 503')

      const emptyData = new FigTreeError({
        code: ErrorCodes.operatorFailure,
        message: 'boom',
        path: [],
        errorData: {},
      })
      expect(emptyData.prettyPrint()).not.toContain('{}')
    })
  })

  it('isFigTreeError guards correctly', () => {
    expect(isFigTreeError(new FigTreeError({ code: 'x', message: 'm', path: [] }))).toBe(true)
    expect(isFigTreeError(new Error('plain'))).toBe(false)
    expect(isFigTreeError('type-check')).toBe(false)
    expect(isFigTreeError(null)).toBe(false)
  })
})

describe('ErrorCodes registry', () => {
  it('contains the first-cut vocabulary', () => {
    expect(ErrorCodes).toMatchObject({
      unknownOperator: 'unknown-operator',
      typeCheck: 'type-check',
      operatorFailure: 'operator-failure',
      timeout: 'timeout',
      aborted: 'aborted',
      unknownNodeKey: 'unknown-node-key',
      unresolvedVar: 'unresolved-var',
      unrecognizedIdentifier: 'unrecognized-identifier',
    })
  })
})
