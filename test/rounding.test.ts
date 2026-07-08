import { roundDecimal } from '../src'

describe('roundDecimal', () => {
  it('rounds ties half away from zero (sign-symmetric), not like Math.round', () => {
    expect(roundDecimal(2.5)).toBe(3)
    expect(roundDecimal(-2.5)).toBe(-3) // Math.round(-2.5) would be -2
    expect(roundDecimal(0.5)).toBe(1)
    expect(roundDecimal(-0.5)).toBe(-1)
  })

  it('rounds on the decimal representation, not float artifacts', () => {
    expect(roundDecimal(1.005, 2)).toBe(1.01) // naive n*100 rounding gives 1
    expect(roundDecimal(-1.005, 2)).toBe(-1.01)
    expect(roundDecimal(1.0049, 2)).toBe(1)
  })

  it('defaults to 0 decimals and handles ordinary rounding', () => {
    expect(roundDecimal(2.4)).toBe(2)
    expect(roundDecimal(2.6)).toBe(3)
    expect(roundDecimal(0)).toBe(0)
  })

  it('shifts by negative decimals the same way', () => {
    expect(roundDecimal(1234, -2)).toBe(1200)
    expect(roundDecimal(1250, -2)).toBe(1300) // tie rounds away from zero
  })

  it('survives values JS prints in exponential notation', () => {
    expect(roundDecimal(1e-7, 2)).toBe(0)
  })
})
