import JSON5 from 'json5'

/** Lines longer than this break their arrays and objects over several lines. */
const WIDTH = 80
const INDENT = '  '
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

const scalar = (value: unknown): string => JSON5.stringify(value) ?? 'undefined'

const key = (name: string): string => (IDENTIFIER.test(name) ? name : scalar(name))

/**
 * A value as the site displays it: JSON5, single-quoted unless that needs
 * escapes, with unquoted keys where they're identifiers. An array or object
 * stays on one line when it fits in the width left at its indent, and
 * otherwise puts one entry per line, as a person would write it.
 */
export const toJson5 = (value: unknown, indent = ''): string => {
  if (typeof value !== 'object' || value === null) return scalar(value)

  const entries = Array.isArray(value)
    ? value.map((item) => ({ prefix: '', item }))
    : Object.entries(value).map(([name, item]) => ({ prefix: `${key(name)}: `, item }))
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}']
  if (entries.length === 0) return open + close

  const inner = indent + INDENT
  const parts = entries.map(({ prefix, item }) => prefix + toJson5(item, inner))
  const oneLine = Array.isArray(value) ? `[${parts.join(', ')}]` : `{ ${parts.join(', ')} }`
  if (!oneLine.includes('\n') && indent.length + oneLine.length <= WIDTH) return oneLine
  return `${open}\n${parts.map((part) => `${inner}${part},`).join('\n')}\n${indent}${close}`
}

export type Parsed = { ok: true; value: unknown } | { ok: false; error: string }

export const parseJson5 = (text: string): Parsed => {
  try {
    return { ok: true, value: JSON5.parse(text) }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
