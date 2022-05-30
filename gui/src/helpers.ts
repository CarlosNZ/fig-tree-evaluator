const looseJSON = require('loose-json')

export const getInitOptions = () => {
  const savedOptions = parseLocalStorage('options') ?? {}
  const graphQLConnection = savedOptions.graphQLConnection ?? undefined
  const baseEndpoint = savedOptions.baseEndpoint ?? undefined
  const headers = savedOptions.headers ?? undefined
  return {
    graphQLConnection,
    baseEndpoint,
    headers,
  }
}

export const parseLocalStorage = (key: string | object) => {
  const value = typeof key === 'string' ? localStorage.getItem(key) : key
  if (!value) return null
  const convertTypes = (obj: { [key: string]: any }): any =>
    Object.fromEntries(
      Object.entries(obj).map(([key, val]) => {
        if (!isNaN(Number(val))) return [key, Number(val)]
        if (val === 'true') return [key, true]
        if (val === 'false') return [key, false]
        if (val === 'null') return [key, null]
        if (val === 'undefined') return [key, undefined]
        if (val instanceof Object) return [key, convertTypes(val)]
        return [key, val]
      })
    )
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    console.log('parsed', parsed)

    return convertTypes(parsed)
  } catch {
    return null
  }
}

export const JSONstringify = (input: string, compact = false, strict = false) => {
  const indent = compact ? 0 : 2
  try {
    const backtickRe = /`[\s\S]*?`/g
    const backtickSubstitutions = input.match(backtickRe)
    const backtickReplacement = !compact ? input.replaceAll(backtickRe, `"@1234@"`) : input
    const inputObject = looseJSON(backtickReplacement)
    const stringified = strict
      ? JSON.stringify(inputObject, null, indent)
      : JSONstringifyLoose(inputObject, compact)
    let output = stringified
    if (backtickSubstitutions) {
      backtickSubstitutions.forEach((sub) => {
        output = output.replace(`"@1234@"`, sub)
      })
    }
    return output
  } catch {
    return false
  }
}

export const JSONstringifyLoose = (inputObject: object, compact = false) => {
  const objectString = compact ? JSON.stringify(inputObject) : JSON.stringify(inputObject, null, 2)
  const regex = /(")([^"]*?)("):/gm
  const replacementString = objectString.replaceAll(regex, '$2:')
  return replacementString
}

export const validateExpression = (input: string): boolean => {
  try {
    looseJSON(input)
    return true
  } catch {
    return false
  }
}

export const validateObjects = (objects: string): boolean => {
  try {
    const cleanObjectInput = looseJSON(objects)
    if (!Array.isArray(cleanObjectInput)) looseJSON(`${objects}`)
    return true
  } catch {
    return false
  }
}
