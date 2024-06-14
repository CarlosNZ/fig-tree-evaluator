import { EvaluatorNode, EvaluatorOutput, Operator } from './types'

export class FigTreeError extends Error {
  public operator?: Operator
  public errorData?: Record<string, unknown>
  public expression?: EvaluatorNode
  public prettyPrint: string

  constructor(
    error: Error & { errorData?: Record<string, unknown> },
    operator?: Operator,
    name?: string,
    expression?: EvaluatorNode
  ) {
    super(error.message)
    Object.assign(this, error)
    this.operator = operator
    this.expression = expression
    this.errorData = error.errorData

    if (name) this.name = name
    if (this.name === 'Error') this.name = 'FigTreeError'

    // Prepare formatted string
    const operatorText = operator ? 'Operator: ' + operator : ''
    const nameText = this.name === 'FigTreeError' ? '' : ` - ${this.name}`
    const topLine = operatorText + nameText
    const extraData = this.errorData ? '\n' + JSON.stringify(this.errorData, null, 2) : ''

    this.prettyPrint = `${topLine !== '' ? topLine + '\n' : ''}${this.message}${
      extraData === '\n{}' ? '' : extraData
    }`
  }
}

export const isFigTreeError = (input: unknown): input is FigTreeError =>
  input instanceof FigTreeError

/**
 * Will throw an error (FigTreeError) if no `fallback` is provided. If
 * `returnErrorAsString` is enabled, then it won't throw, but instead return a
 * string containing a formatted error message.
 */
interface FallbackOrErrorInput {
  fallback?: EvaluatorOutput
  operator?: Operator
  name?: string
  error: Error | string
  expression: EvaluatorNode
  returnErrorAsString?: boolean
}
export const fallbackOrError = ({
  fallback,
  operator,
  name,
  error,
  expression,
  returnErrorAsString = false,
}: FallbackOrErrorInput) => {
  if (fallback !== undefined) return fallback

  if (error instanceof FigTreeError) {
    if (!returnErrorAsString) throw error
    return error.prettyPrint
  }

  const figTreeError = new FigTreeError(
    typeof error === 'string' ? new Error(error) : error,
    operator,
    name,
    expression
  )

  if (returnErrorAsString) return figTreeError.prettyPrint

  throw figTreeError
}
