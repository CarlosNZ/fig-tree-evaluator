/*
Cache store used by main FigTreeEvaluator instance.

Previous evaluation results are stored in `store` object, using a stringified
concatenation of the input parameters as keys.

A `queue` (of the keys) is maintained in order to determine recency. (Oldest
items are dropped from the queue/store when `maxSize` is reached)
*/

import { EvaluatorOutput, UnknownFunction } from './types'

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

  public useCache = async (
    shouldUseCache: boolean,
    action: UnknownFunction,
    ...args: unknown[]
  ) => {
    if (!shouldUseCache) return await action(...args)

    const key = stringifyInput(args)

    if (key in this.store) {
      // Move key to end of queue
      this.queue = this.queue.filter((val) => val !== key)
      this.queue.unshift(key)
      return this.store[key]
    }

    // Otherwise create a new cache entry
    const result = await action(...args)
    this.store[key] = result
    this.queue.unshift(key)
    this.resizeCache()
    return result
  }

  public getMax = () => this.maxSize

  public setMax = (size: number) => {
    this.maxSize = size
    this.resizeCache()
  }

  private resizeCache = () => {
    if (this.queue.length > this.maxSize) {
      const keysToRemove = this.queue.slice(this.maxSize)
      keysToRemove.forEach((key) => delete this.store[key])
      this.queue = this.queue.slice(0, this.maxSize)
    }
  }
}

export default FigTreeCache

const stringifyInput = (args: unknown[]) =>
  args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join('_')
