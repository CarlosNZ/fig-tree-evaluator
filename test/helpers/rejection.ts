/** Await a rejection and return the error; fail if the promise resolves. */
export const rejection = async <E = Error>(promise: Promise<unknown>): Promise<E> => {
  try {
    await promise
  } catch (error) {
    return error as E
  }
  throw new Error('expected a rejection')
}
