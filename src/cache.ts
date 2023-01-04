import { EvaluatorOutput } from './types'

const MAX_CACHED_ITEMS = 50 // Default if not specified

class FigTreeCache {
  private store: { [key: string]: EvaluatorOutput }
  private queue: string[]
  private maxSize: number
  constructor(maxSize?: number) {
    this.store = {}
    this.queue = []
    this.maxSize = maxSize ?? MAX_CACHED_ITEMS
  }

  public useCache = async (shouldUseCache: boolean, action: Function, ...args: any[]) => {
    if (!shouldUseCache) return await action(...args)

    const key = stringifyInput(args)
    if (key in this.store) {
      this.queue = this.queue.filter((val) => val !== key)
      this.queue.unshift(key)
      console.log('Queue', this.queue)
      return this.store[key]
    }

    const result = await action(...args)
    this.store[key] = result
    if (this.queue.length >= this.maxSize) this.queue = this.queue.slice(0, this.maxSize - 1)
    this.queue.unshift(key)
    console.log('Queue', this.queue)
    return result
  }

  public getMax = () => this.maxSize

  public setMax = (size: number) => {
    this.maxSize = size
  }
}

export default FigTreeCache

const stringifyInput = (args: any[]) => {
  return args.reduce((outputString, arg, index) => {
    const part = typeof arg === 'object' ? JSON.stringify(arg) : arg
    return index === 0 ? `${part}` : `${outputString}_${part}`
  }, '')
}
