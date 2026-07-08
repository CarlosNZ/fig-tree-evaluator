import { isTruthy } from '../src'

describe('isTruthy', () => {
  it('treats exactly false / null / 0 / "" as falsy', () => {
    expect(isTruthy(false)).toBe(false)
    expect(isTruthy(null)).toBe(false)
    expect(isTruthy(0)).toBe(false)
    expect(isTruthy(-0)).toBe(false)
    expect(isTruthy('')).toBe(false)
  })

  it('treats everything else as truthy, including empty containers', () => {
    expect(isTruthy([])).toBe(true)
    expect(isTruthy({})).toBe(true)
    expect(isTruthy(' ')).toBe(true)
    expect(isTruthy('0')).toBe(true)
    expect(isTruthy('false')).toBe(true)
    expect(isTruthy(1)).toBe(true)
    expect(isTruthy(-1)).toBe(true)
    expect(isTruthy(true)).toBe(true)
  })
})
