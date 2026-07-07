/**
 * Shared v3 test doubles — the observability harness the worked examples assume.
 * Built once here, imported everywhere the v3 suite needs to inspect I/O and
 * caching behaviour as counts and call logs.
 */
export { MockHttpClient, MockHttpFailure } from './mockHttpClient'
export type { MockHttpRequest, MockHttpClientOptions } from './mockHttpClient'
export { RecordingCacheStore } from './recordingCacheStore'
export type { CacheLogEntry } from './recordingCacheStore'
