import { toJson5 } from '../../lib/json5'

/** Up to this many characters, a string or number shows large… */
const LARGE = 24
/** …and up to this many, a size between that and the body's. */
const MEDIUM = 80

/**
 * A value as the widget shows a result. A string or number reads as text, in
 * the body font, without quotes, and the shorter it is the larger it shows.
 * Anything else (objects, arrays, booleans, null) is code: JSON5, in the
 * code font, a lone literal larger than a structure.
 */
export const ResultValue = ({ value }: { value: unknown }) => {
  if (typeof value === 'object' && value !== null)
    return <pre className="fds-value fds-value--code">{toJson5(value)}</pre>
  // true, false, null: code, but standing alone, so a size up
  if (typeof value !== 'string' && typeof value !== 'number')
    return <pre className="fds-value fds-value--code fds-value--literal">{toJson5(value)}</pre>
  const text = String(value)
  if (text === '') return <div className="fds-value fds-value--empty">(empty string)</div>
  const size = text.length <= LARGE ? 'large' : text.length <= MEDIUM ? 'medium' : 'small'
  return <div className={`fds-value fds-value--text fds-value--${size}`}>{text}</div>
}

/** A value as text to copy: a string as itself, anything else as JSON5. */
export const copyText = (value: unknown): string =>
  typeof value === 'string' ? value : toJson5(value)
