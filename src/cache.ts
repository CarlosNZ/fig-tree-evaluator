/*
Cache store used by main FigTreeEvaluator instance.

Previous evaluation results are stored in `store` object, using a stringified
concatenation of the input parameters as keys.

A `queue` (of the keys) is maintained in order to determine recency. (Oldest
items are dropped from the queue/store when `maxSize` is reached)
*/

import { EvaluatorOutput, UnknownFunction } from './types'

// Cache defaults if not specified
const MAX_CACHED_ITEMS = 50
const MAX_CACHE_TIME = 1800 // seconds = 30 minutes

interface CacheOptions {
  maxSize?: number
  maxTime?: number
}

class FigTreeCache {
  private store: { [key: string]: { result: EvaluatorOutput; timestamp: number } }
  private queue: string[]
  private maxSize: number
  private maxTime: number
  constructor(options?: CacheOptions) {
    this.store = {}
    this.queue = []
    this.maxSize = options?.maxSize ?? MAX_CACHED_ITEMS
    this.maxTime = options?.maxTime ?? MAX_CACHE_TIME
  }

  public useCache = async (
    shouldUseCache: boolean,
    action: UnknownFunction,
    ...args: unknown[]
  ) => {
    if (!shouldUseCache) return await action(...args)

    const key = stringifyInput(args)

    const keyExists = key in this.store
    const newTimestamp = Date.now()
    const isExpired = keyExists && newTimestamp - this.store[key].timestamp > this.maxTime * 1000

    if (keyExists) {
      // Move key to end of queue
      this.queue = this.queue.filter((val) => val !== key)
      this.queue.unshift(key)

      this.store[key].timestamp = newTimestamp

      // Re-calculate if expired
      if (isExpired) this.store[key].result = await action(...args)

      return this.store[key].result
    }

    // Otherwise create a new cache entry
    const result = await action(...args)
    this.store[key] = { result, timestamp: newTimestamp }
    this.queue.unshift(key)
    this.resizeCache()
    return result
  }

  public getMax = () => this.maxSize

  public setMax = (size: number) => {
    this.maxSize = size
    this.resizeCache()
  }

  public getMaxTime = () => this.maxTime

  public setMaxTime = (time: number) => {
    this.maxTime = time
  }

  public getCache = () => this.store

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
