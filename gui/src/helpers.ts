const looseJSON = require('loose-json')

export const fetchNative = async (url: string, obj: any) => {
  const result = await fetch(url, obj)
  return result
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
