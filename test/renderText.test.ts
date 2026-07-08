import { renderText, ARRAY, OBJECT } from '../src'

describe('renderText', () => {
  it('renders scalars per the table', () => {
    expect(renderText('abc')).toBe('abc')
    expect(renderText(1.5)).toBe('1.5')
    expect(renderText(1e21)).toBe('1e+21')
    expect(renderText(-0)).toBe('0')
    expect(renderText(true)).toBe('true')
    expect(renderText(false)).toBe('false')
  })

  it('renders null as an empty string', () => {
    expect(renderText(null)).toBe('')
  })

  it('renders composites as self-signaling placeholders (never "[object Object]")', () => {
    expect(renderText([1, 2])).toBe(ARRAY)
    expect(renderText([])).toBe('<array>')
    expect(renderText({ a: 1 })).toBe(OBJECT)
    expect(renderText({})).toBe('<object>')
  })
})
