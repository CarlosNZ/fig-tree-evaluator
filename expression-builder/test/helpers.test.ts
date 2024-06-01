import { isShorthandWrapper, isShorthandStringNode, isShorthandString } from '../src/helpers'

const shorthandStringNode = { $getData: 'user.firstName' }
const shorthandObjectNode = { $getData: { property: 'user.firstName' } }
const shorthandObjectNode2 = {
  $plus: [{ $getData: 'user.firstName' }, ' ', { $getData: 'user.lastName' }],
}
const shorthandString = '$getData(myCountry)'

test('Shorthand Node (object)', () => {
  expect(isShorthandWrapper(shorthandObjectNode)).toBe(true)
})
