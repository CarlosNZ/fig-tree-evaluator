import { MockHttpClient, MockHttpFailure, RecordingCacheStore } from './index'

const anySignal = () => new AbortController().signal

describe('MockHttpClient', () => {
  it('counts calls and records the request log', async () => {
    const client = new MockHttpClient({ responses: { '/users': [{ id: 1 }] } })

    expect(client.callCount).toBe(0)
    const result = await client.request({
      url: 'https://api.test/users?page=1',
      method: 'get',
      headers: { authorization: 'token' },
      signal: anySignal(),
    })

    expect(result).toEqual([{ id: 1 }])
    expect(client.callCount).toBe(1)
    expect(client.calls[0]).toMatchObject({
      url: 'https://api.test/users?page=1',
      method: 'get',
      headers: { authorization: 'token' },
    })
  })

  it('matches responses by substring by default and falls back to defaultResponse', async () => {
    const client = new MockHttpClient({
      responses: { 'countries/nz': { name: 'New Zealand' } },
      defaultResponse: { fallback: true },
    })

    expect(
      await client.request({ url: 'https://x/countries/nz/full', method: 'get', headers: {}, signal: anySignal() })
    ).toEqual({ name: 'New Zealand' })
    expect(
      await client.request({ url: 'https://x/unknown', method: 'get', headers: {}, signal: anySignal() })
    ).toEqual({ fallback: true })
    expect(client.callCount).toBe(2)
  })

  it('honours exactMatch when requested', async () => {
    const client = new MockHttpClient({ responses: { 'https://x/a': 1 }, exactMatch: true, defaultResponse: 0 })
    expect(await client.request({ url: 'https://x/a', method: 'get', headers: {}, signal: anySignal() })).toBe(1)
    expect(await client.request({ url: 'https://x/a/b', method: 'get', headers: {}, signal: anySignal() })).toBe(0)
  })

  it('throws MockHttpFailure with errorData when the failure switch is on', async () => {
    const client = new MockHttpClient({ fail: true, failMessage: 'boom', failData: { status: 500 } })

    await expect(
      client.request({ url: 'https://x/y', method: 'get', headers: {}, signal: anySignal() })
    ).rejects.toBeInstanceOf(MockHttpFailure)

    // still counts as a call
    expect(client.callCount).toBe(1)
    try {
      await client.request({ url: 'https://x/y', method: 'get', headers: {}, signal: anySignal() })
    } catch (err) {
      expect((err as MockHttpFailure).errorData).toEqual({ status: 500 })
    }
  })

  it('applies latency and can be aborted mid-flight', async () => {
    const client = new MockHttpClient({ latencyMs: 50, responses: { '/slow': 'ok' } })
    const controller = new AbortController()

    const pending = client.request({ url: '/slow', method: 'get', headers: {}, signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reset() clears the call log but keeps switch settings', async () => {
    const client = new MockHttpClient({ responses: { '/a': 1 } })
    await client.request({ url: '/a', method: 'get', headers: {}, signal: anySignal() })
    expect(client.callCount).toBe(1)
    client.reset()
    expect(client.callCount).toBe(0)
  })
})

describe('RecordingCacheStore', () => {
  it('stores and returns values', () => {
    const cache = new RecordingCacheStore()
    cache.set('k', { v: 1 })
    expect(cache.get('k')).toEqual({ v: 1 })
    expect(cache.size).toBe(1)
  })

  it('logs keys and distinguishes hits from misses', () => {
    const cache = new RecordingCacheStore()
    cache.get('missing') // miss
    cache.set('present', 42)
    cache.get('present') // hit

    expect(cache.keysGotten()).toEqual(['missing', 'present'])
    expect(cache.keysSet()).toEqual(['present'])
    expect(cache.misses).toBe(1)
    expect(cache.hits).toBe(1)
  })

  it('reset() empties the store and the log', () => {
    const cache = new RecordingCacheStore()
    cache.set('a', 1)
    cache.get('a')
    cache.reset()
    expect(cache.size).toBe(0)
    expect(cache.log).toHaveLength(0)
  })
})
