/**
 * Abstraction wrappers to standardise the implementations of various HTTP
 * clients
 */

import { type AxiosRequestConfig, type AxiosStatic } from 'axios'
import { type RequestInfo, type RequestInit, type Response } from 'node-fetch'
import { HttpClient, HttpRequest } from './operators/operatorUtils'
import { FigTreeError } from './FigTreeError'

export type Fetch = (
  input: URL | string | RequestInfo,
  init?: RequestInit | undefined
) => Promise<Response>

declare const window: { document: unknown; fetch: Fetch }

/**
 * Wrap the specified Http client in abstraction wrapper
 */
export const getHttpClient = (client: HttpClient | undefined): HttpClient | undefined => {
  if (!client) {
    // In browser, use built-in `fetch` by default
    if (typeof window !== 'undefined' && 'document' in window && 'fetch' in window)
      return FetchClient(window.fetch)
    else return undefined
  }

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
    if (axios.isAxiosError(err) && err.response) {
      ;(err as Partial<FigTreeError>).errorData = {
        status: err.response?.status,
        error: err.response?.statusText,
        url: err.config?.url,
        response: err.response?.data,
      }
      throw err
    }
    throw new Error('Network error: ' + (err as Error)?.message)
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
    const queryString =
      Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : ''

    const response = await fetch(url + queryString, { headers, method: 'GET' } as RequestInit)
    const json = await response.json()
    if (!response.ok) {
      const err = new Error('Problem with GET request') as FigTreeError
      err.name = 'FetchError'
      err.errorData = {
        status: response.status,
        error: response.statusText,
        url: response.url,
        response: json,
      }
      console.log(err.errorData)
      throw err
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
      const err = new Error('Problem with POST request') as FigTreeError
      err.name = 'FetchError'
      err.errorData = {
        status: response.status,
        error: response.statusText,
        url: response.url,
        response: json,
      }
      console.log(err.errorData)
      throw err
    }
    return json
  }

  const throwError = (err: unknown) => {
    throw err
  }

  return { get, post, throwError }
}
