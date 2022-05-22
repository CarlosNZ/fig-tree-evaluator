import React, { useState, useEffect } from 'react'
import './App.css'
import {
  Card,
  CardContent,
  FormControlLabel,
  Checkbox,
  Button,
  Grid,
  TextField,
  Typography,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material'
import { makeStyles } from '@mui/material'
import evaluatorDev from './expression-evaluator/evaluateExpression'
import evaluatorPublished from './expression-evaluator/evaluateExpression'
// import evaluatorPublished from '@openmsupply/expression-evaluator'
import config from './config.json'
import { PostgresInterface } from './postgresInterface'

const looseJSON = require('loose-json')
const graphQLendpoint = config.graphQLendpoint

const pgInterface = new PostgresInterface()

async function fetchNative(url: string, obj: any) {
  const result = await fetch(url, obj)
  return result
}

// const useStyles = makeStyles((theme: any) => ({
//   margin: {
//     margin: theme.spacing(1),
//   },
//   textField: {
//     fontFamily: ['monospace'],
//   },
// }))

function App() {
  // const classes = useStyles()

  const [result, setResult] = useState<string>()
  const [resultType, setResultType] = useState('string')

  const [input, setInput] = useState(
    localStorage.getItem('inputText') || '{ value: "Enter expression here"}'
  )
  const [objectsInput, setObjectsInput] = useState(
    localStorage.getItem('objectText') || `{firstName: "Carl", lastName: "Smith"}`
  )
  const [objects, setObjects] = useState<object>()
  const [isObjectsValid, setIsObjectsValid] = useState(true)
  const [jwtToken, setJwtToken] = useState(localStorage.getItem('JWT'))
  const [strictJSONInput, setStrictJSONInput] = useState(false)
  const [strictJSONObjInput, setStrictJSONObjInput] = useState(false)
  const [evaluatorSelection, setEvaluatorSelection] = useState(
    localStorage.getItem('evaluatorSelection') || 'Development'
  )
  const [evaluate, setEvaluate] = useState(
    evaluatorSelection === 'Development' ? () => evaluatorDev : () => evaluatorPublished
  )

  // Evaluate output whenever input or input objects change
  useEffect(() => {
    if (input === '') {
      setResult('No input')
      return
    }
    let cleanInput
    try {
      cleanInput = looseJSON(input)
    } catch {
      cleanInput = { value: '< Invalid input >' }
    }
    const headers: any = jwtToken ? { Authorization: 'Bearer ' + jwtToken } : {}
    evaluate(cleanInput, {
      objects: objects,
      pgConnection: pgInterface,
      graphQLConnection: { fetch: fetchNative, endpoint: graphQLendpoint },
      APIfetch: fetchNative,
      headers,
    })
      .then((res) => {
        const output = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res)
        setResult(output)
        setResultType(typeof res === 'object' ? 'object' : 'other')
      })
      .catch((error) => {
        setResult(error.message)
        setResultType('error')
      })
    localStorage.setItem('inputText', input)
  }, [input, objectsInput, objects, evaluatorSelection, jwtToken])

  // Try and turn object(s) input string into object array
  useEffect(() => {
    let cleanObjectInput
    try {
      cleanObjectInput = looseJSON(objectsInput)
      if (!Array.isArray(cleanObjectInput)) {
        cleanObjectInput = looseJSON(`${objectsInput}`)
      }
      setObjects(cleanObjectInput)
      setIsObjectsValid(true)
    } catch {
      setObjects({})
      setIsObjectsValid(false)
    } finally {
      localStorage.setItem('objectText', objectsInput)
    }
  }, [objectsInput])

  const handleInputChange = (event: any) => {
    setInput(event.target.value)
  }

  const handleObjectsChange = (event: any) => {
    setObjectsInput(event.target.value)
  }

  const handleJWTChange = (event: any) => {
    setJwtToken(event.target.value)
    localStorage.setItem('JWT', event.target.value)
  }

  const handleSelect = (event: any) => {
    setEvaluatorSelection(event.target.value)
    localStorage.setItem('evaluatorSelection', event.target.value)
    if (event.target.value === 'Development') setEvaluate(() => evaluatorDev)
    else setEvaluate(() => evaluatorPublished)
  }

  const JSONstringify = (input: string, compact = false, strict = false) => {
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

  const JSONstringifyLoose = (inputObject: object, compact = false) => {
    const objectString = compact
      ? JSON.stringify(inputObject)
      : JSON.stringify(inputObject, null, 2)
    const regex = /(")([^"]*?)("):/gm
    const replacementString = objectString.replaceAll(regex, '$2:')
    return replacementString
  }

  const prettifyInput = () => {
    const pretty = JSONstringify(input, false, strictJSONInput)
    if (pretty) setInput(pretty)
    else alert('Invalid input')
  }

  const compactInput = () => {
    const compact = JSONstringify(input, true, strictJSONInput)
    if (compact) setInput(compact)
    else alert('Invalid input')
  }

  const prettifyObjects = () => {
    let objectsInputArrayStr = objectsInput
    const pretty = JSONstringify(objectsInputArrayStr, false, strictJSONObjInput)
    if (pretty) setObjectsInput(pretty)
    else alert('Invalid input')
  }

  const compactObjects = () => {
    const compact = JSONstringify(objectsInput, true, strictJSONObjInput)
    if (compact) setObjectsInput(compact)
    else alert('Invalid input')
  }

  return (
    <Grid container>
      <Grid item xs sx={{ margin: 1 }}>
        <h1>Local state objects</h1>
        <Button
          // className={classes.margin}
          variant="contained"
          size="small"
          color="primary"
          onClick={prettifyObjects}
        >
          Prettify
        </Button>
        <Button
          sx={{ margin: 1 }}
          variant="contained"
          size="small"
          color="primary"
          onClick={compactObjects}
        >
          Compact
        </Button>
        <FormControlLabel
          control={
            <Checkbox
              color="primary"
              checked={strictJSONObjInput}
              onChange={() => {
                setStrictJSONObjInput(!strictJSONObjInput)
              }}
            />
          }
          label="Quoted field names"
        />
        <TextField
          sx={{ margin: 1 }}
          id="object-input"
          label="Objects"
          inputProps={{ sx: { fontFamily: 'monospace' } }}
          multiline
          fullWidth
          spellCheck="false"
          rows={21}
          value={objectsInput}
          variant="outlined"
          onChange={handleObjectsChange}
        />
        <Typography className="invalid-warning" style={{ color: 'red' }}>
          {!isObjectsValid ? 'Invalid object input' : ''}
        </Typography>
        <TextField
          sx={{ margin: 1 }}
          id="jwt-input"
          label="JWT Token"
          inputProps={{ sx: { fontFamily: 'monospace' } }}
          multiline
          fullWidth
          spellCheck="false"
          rows={5}
          value={jwtToken}
          variant="outlined"
          onChange={handleJWTChange}
        />
      </Grid>
      <Grid item xs sx={{ margin: 1 }}>
        <h1>Input</h1>
        <Button
          sx={{ margin: 1 }}
          variant="contained"
          size="small"
          color="primary"
          onClick={prettifyInput}
        >
          Prettify
        </Button>
        <Button
          sx={{ margin: 1 }}
          variant="contained"
          size="small"
          color="primary"
          onClick={compactInput}
        >
          Compact
        </Button>
        <FormControlLabel
          control={
            <Checkbox
              color="primary"
              checked={strictJSONInput}
              onChange={() => {
                setStrictJSONInput(!strictJSONInput)
              }}
            />
          }
          label="Quoted field names"
        />
        <TextField
          sx={{ margin: 1 }}
          id="query-input"
          label="Expression"
          spellCheck="false"
          inputProps={{ sx: { fontFamily: 'monospace' } }}
          multiline
          fullWidth
          rows={30}
          value={input}
          variant="outlined"
          onChange={handleInputChange}
        />
      </Grid>
      <Grid item xs sx={{ margin: 1 }}>
        <h1>Output</h1>
        <InputLabel shrink id="demo-simple-select-placeholder-label-label">
          Evaluator version
        </InputLabel>
        <Select id="evalSelect" value={evaluatorSelection} autoWidth onChange={handleSelect}>
          <MenuItem value={'Development'}>Development</MenuItem>
          <MenuItem value={'Published'}>Published</MenuItem>
        </Select>
        <Card style={{ marginTop: 7 }} variant="outlined">
          <CardContent>
            <Typography variant="body1" component="p">
              {resultType === 'object' && <pre>{result}</pre>}
              {resultType === 'other' && <span className="result-text">{result}</span>}
              {resultType === 'error' && <span className="error-text">{result}</span>}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}

export default App
