/**
 * The v3 suite, as jest.config.js runs it, with every message in src/
 * wrapped to record what it produces. Run by `pnpm messages`, never by CI.
 */
import { join } from 'node:path'
import base from '../../jest.config.js'

const here = import.meta.dirname

export default {
  ...base,
  rootDir: join(here, '..', '..'),
  transform: {
    '^.+\\.(ts|tsx)$': [join(here, 'transform.mjs'), { tsconfig: 'tsconfig.test.json' }],
  },
  setupFiles: [...(base.setupFiles ?? []), join(here, 'record.cjs')],
  setupFilesAfterEnv: [...(base.setupFilesAfterEnv ?? []), join(here, 'flush.cjs')],
  verbose: false,
}
