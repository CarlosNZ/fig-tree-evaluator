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

  public useCache = async (shouldUseCache: boolean, action: Function, ...args: unknown[]) => {
    if (!shouldUseCache) return await action(...args)

    const key = stringifyInput(args)
    if (key in this.store) {
      // Move key to end of queue
      this.queue = this.queue.filter((val) => val !== key)
      this.queue.unshift(key)
      // console.log('Using cached result:', this.store[key])
      return this.store[key]
    }

    // Otherwise create a new cache entry
    const result = await action(...args)
    this.store[key] = result
    if (this.queue.length >= this.maxSize) {
      const keysToRemove = this.queue.slice(this.maxSize - 1)
      keysToRemove.forEach((key) => delete this.store[key])
      this.queue = this.queue.slice(0, this.maxSize - 1)
    }
    this.queue.unshift(key)
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
