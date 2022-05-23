import { useState, useEffect } from 'react'
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
import EvaluatorDev from './expression-evaluator/evaluator'
import EvaluatorPublished from './expression-evaluator/evaluator'
// CHANGE THIS AFTER FIRST PUBLISH
// import evaluatorPublished from '@openmsupply/expression-evaluator'
import { fetchNative, JSONstringify, JSONstringifyLoose } from './helpers'
import config from './config.json'
import initData from './data.json'
import { PostgresInterface } from './postgresInterface'
import useDebounce from './useDebounce'
import { ValueNode } from './expression-evaluator/types'

const looseJSON = require('loose-json')
const graphQLendpoint = config.graphQLendpoint
const pgInterface = new PostgresInterface()

const evaluatorParams = {
  pgConnection: pgInterface,
  graphQLConnection: { fetch: fetchNative, endpoint: graphQLendpoint },
  APIfetch: fetchNative,
}

const expDev = new EvaluatorDev(evaluatorParams)
const expPub = new EvaluatorPublished(evaluatorParams)

interface InputState {
  expression: string
  objects: string
}

interface IsValidState {
  expression: boolean
  objects: boolean
}

interface ConfigState {
  pgConnection: PostgresInterface
  graphQLConnection: any
  APIfetch: (url: string, obj: any) => Promise<Response>
}

interface Result {
  result: ValueNode
  error: string | false
}

function App() {
  const [debounceOutput, setDebounceInput] = useDebounce<string>('')

  const [inputState, setInputState] = useState<InputState>({
    expression: localStorage.getItem('inputText') || JSONstringifyLoose(initData.expression),
    objects: localStorage.getItem('objectText') || JSONstringifyLoose(initData.objects),
  })
  const [result, setResult] = useState<Result>({ result: null, error: false })
  const [isValidState, setIsValidState] = useState<IsValidState>({
    expression: validateExpression(inputState.expression),
    objects: validateObjects(inputState.objects),
  })
  const [configState, setConfigState] = useState<ConfigState>()

  // DEPRECATE THESE
  const [isObjectsValid, setIsObjectsValid] = useState(true)
  const [jwtToken, setJwtToken] = useState(localStorage.getItem('JWT'))
  const [strictJSONInput, setStrictJSONInput] = useState(false)
  const [strictJSONObjInput, setStrictJSONObjInput] = useState(false)
  const [evaluatorSelection, setEvaluatorSelection] = useState(
    localStorage.getItem('evaluatorSelection') || 'Development'
  )
  const [evaluator, setEvaluator] = useState(
    evaluatorSelection === 'Development' ? () => expDev : () => expPub
  )

  useEffect(() => {
    const { expression, objects } = inputState
    localStorage.setItem('inputText', expression)
    localStorage.setItem('objectText', objects)
    const expressionValid = validateExpression(inputState.expression)
    const objectsValid = validateObjects(inputState.objects)
    setIsValidState({ expression: expressionValid, objects: objectsValid })

    if (!expressionValid || !objectsValid) {
      setResult({ result: 'Invalid Input', error: false })
      return
    }

    const headers: any = jwtToken ? { Authorization: 'Bearer ' + jwtToken } : {}
    evaluator
      .evaluate(looseJSON(expression), { objects: looseJSON(objects) })
      .then((result) => {
        setResult({ result, error: false })
      })
      .catch((error) => {
        setResult({ result: null, error: error.message })
      })
  }, [debounceOutput, evaluatorSelection])

  const updateInput = (text: string, type: 'expression' | 'objects') => {
    setInputState({ ...inputState, [type]: text })
    setDebounceInput(text)
  }

  const handleJWTChange = (event: any) => {
    setJwtToken(event.target.value)
    localStorage.setItem('JWT', event.target.value)
    setDebounceInput(event.target.value)
  }

  const handleSelect = (event: any) => {
    setEvaluatorSelection(event.target.value)
    localStorage.setItem('evaluatorSelection', event.target.value)
    if (event.target.value === 'Development') setEvaluator(expDev)
    else setEvaluator(expPub)
  }

  const prettifyInput = (type: 'expression' | 'objects') => {
    const currentValue = inputState[type]
    const pretty = JSONstringify(currentValue, false, strictJSONInput)
    if (pretty) setInputState((currState) => ({ ...currState, [type]: pretty }))
    else alert('Invalid input')
  }

  const compactInput = (type: 'expression' | 'objects') => {
    const currentValue = inputState[type]
    const compact = JSONstringify(currentValue, true, strictJSONInput)
    if (compact) setInputState((currState) => ({ ...currState, [type]: compact }))
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
          onClick={() => prettifyInput('objects')}
        >
          Prettify
        </Button>
        <Button
          sx={{ margin: 1 }}
          variant="contained"
          size="small"
          color="primary"
          onClick={() => compactInput('objects')}
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
          value={inputState.objects}
          variant="outlined"
          onChange={(e) => updateInput(e?.target?.value, 'objects')}
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
          onClick={() => prettifyInput('expression')}
        >
          Prettify
        </Button>
        <Button
          sx={{ margin: 1 }}
          variant="contained"
          size="small"
          color="primary"
          onClick={() => compactInput('expression')}
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
          value={inputState.expression}
          variant="outlined"
          onChange={(e) => updateInput(e?.target?.value, 'expression')}
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
              {typeof result.result === 'object' && !result.error ? (
                <pre>{JSON.stringify(result.result)}</pre>
              ) : (
                <span className="result-text">{result.result as string}</span>
              )}

              {result.error && <span className="error-text">{result.error}</span>}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}

export default App

const validateExpression = (input: string): boolean => {
  try {
    looseJSON(input)
    return true
  } catch {
    return false
  }
}

const validateObjects = (objects: string): boolean => {
  try {
    console.log(looseJSON(objects))
    const cleanObjectInput = looseJSON(objects)
    if (!Array.isArray(cleanObjectInput)) looseJSON(`${objects}`)
    return true
  } catch {
    console.log('Invalid')
    return false
  }
}
