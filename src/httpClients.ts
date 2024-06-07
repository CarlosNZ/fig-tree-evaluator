/**
 * Abstraction wrappers to standardise the implementations of various HTTP
 * clients
 */

import { type AxiosRequestConfig, type AxiosStatic } from 'axios'
import { type RequestInfo, type RequestInit, type Response } from 'node-fetch'
import querystring from 'querystring'
import { HttpClient, HttpRequest } from './operators/operatorUtils'
import { errorMessage } from './helpers'

export type Fetch = (
  input: URL | string | RequestInfo,
  init?: RequestInit | undefined
) => Promise<Response>

declare const window: { document: unknown; fetch: Fetch }

/**
 * Auto-detect the passed-in client and return it in the appropriate abstraction
 * wrapper
 */
export const getHttpClient = (
  client: HttpClient | AxiosStatic | Fetch | undefined
): HttpClient | undefined => {
  if (!client) {
    // In browser, use built-in `fetch` by default
    if (typeof window !== 'undefined' && 'document' in window && 'fetch' in window)
      return FetchClient(window.fetch)
    else return undefined
  }
  if ('name' in client && client.name === 'fetch') return FetchClient(client as Fetch)

  if ('Axios' in client && client.Axios.name === 'Axios') return AxiosClient(client)

  return client as HttpClient
}

/**
 * Axios
 * https://www.npmjs.com/package/axios
 */

export const AxiosClient = (axios: AxiosStatic) => {
  const get = async (req: Omit<HttpRequest, 'method'>) => {
    const response = await axios({ ...req, method: 'get' } as AxiosRequestConfig)
    return response.data
  }

  const post = async (req: Omit<HttpRequest, 'method'>) => {
    const response = await axios({ ...req, method: 'post' } as AxiosRequestConfig)
    return response.data
  }

  const throwError = (err: unknown) => {
    if (axios.isAxiosError(err)) {
      if (!err?.response) throw new Error('Network Error')
      console.log(err.response?.data)
    }
    throw err
  }

  return { get, post, throwError }
}

/**
 * Fetch / Node-fetch
 * https://www.npmjs.com/package/node-fetch
 * (should also work with browser window.fetch)
 */

export const FetchClient = (fetch: Fetch) => {
  const get = async (req: Omit<HttpRequest, 'method'>) => {
    const { url, headers, params = {} } = req
    const queryString = Object.keys(params).length > 0 ? `?${querystring.stringify(params)}` : ''

    const response = await fetch(url + queryString, { headers, method: 'GET' } as RequestInit)
    const json = await response.json()
    if (!response.ok) {
      console.log(json)
      throw new Error(`Request failed with status code ${response.status}`)
    }
    return json
  }

  const post = async (req: Omit<HttpRequest, 'method'>) => {
    const { url, headers, params, data } = req
    const queryParams = new URLSearchParams(params)
    const queryString = queryParams.size > 0 ? `?${queryParams.toString()}` : ''
    const response = await fetch(url + queryString, {
      headers,
      body: JSON.stringify(data),
      method: 'POST',
    } as RequestInit)
    const json = await response.json()
    if (!response.ok) {
      console.log(json)
      throw new Error(`Request failed with status code ${response.status}`)
    }
    return json
  }

  const throwError = (err: unknown) => {
    throw new Error(`${errorMessage(err)}`)
  }

  return { get, post, throwError }
}
