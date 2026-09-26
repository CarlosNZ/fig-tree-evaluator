/**
 * The module the Postgres recorder writes (differential/recordSql.ts),
 * evaluated as the TypeScript it is, for the suites that check it holds
 * what was recorded.
 */
import ts from 'typescript'
import type { SqlRecording } from '../../differential/mocks/postgres'

export const evaluateRecordings = (source: string): SqlRecording[] => {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exported: { sqlRecordings?: SqlRecording[] } = {}
  new Function('exports', 'Buffer', outputText)(exported, Buffer)
  return exported.sqlRecordings ?? []
}
