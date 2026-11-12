/**
 * After each test file under `pnpm messages`: write what record.cjs noted.
 */
const { relative, join } = require('node:path')

afterAll(() => {
  const testPath = expect.getState().testPath
  globalThis.__msgFlush(testPath ? relative(join(__dirname, '..', '..'), testPath) : null)
})
