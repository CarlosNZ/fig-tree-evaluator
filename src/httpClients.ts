/**
 * Wrappers for various HTTP clients
 */

import { AxiosRequestConfig, AxiosStatic } from 'axios'
import { HttpRequest } from './operators/operatorUtils'

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
