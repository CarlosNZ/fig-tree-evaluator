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
import EvaluatorPublished from '@carlosnz/expression-evaluator'
// CHANGE THIS AFTER FIRST PUBLISH
// import evaluatorPublished from '@openmsupply/expression-evaluator'
import { fetchNative, JSONstringify, JSONstringifyLoose } from './helpers'
import config from './config.json'
import initData from './data.json'
import { PostgresInterface } from './postgresInterface'
import useDebounce from './useDebounce'
import { InputState, IsValidState, ConfigState, Result } from './types'

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
  const [configState, setConfigState] = useState<ConfigState>({
    evaluator:
      localStorage.getItem('evaluatorSelection') === 'Development'
        ? (expDev as EvaluatorDev)
        : (expPub as EvaluatorPublished),
    strictJsonExpression: localStorage.getItem('strictJsonExpression') === 'true' ?? false,
    strictJsonObjects: localStorage.getItem('strictJsonObjects') === 'true' ?? false,
  })

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

    const { evaluator } = configState

    // const headers: any = jwtToken ? { Authorization: 'Bearer ' + jwtToken } : {}
    evaluator
      .evaluate(looseJSON(expression), { objects: looseJSON(objects) })
      .then((result) => {
        setResult({ result, error: false })
      })
      .catch((error) => {
        setResult({ result: null, error: error.message })
      })
  }, [debounceOutput, configState]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateInput = (text: string, type: 'expression' | 'objects') => {
    setInputState({ ...inputState, [type]: text })
    setDebounceInput(text)
  }

  const toggleCheckbox = (type: 'strictJsonObjects' | 'strictJsonExpression') => {
    const newState = !configState[type]
    setConfigState((prev) => ({ ...prev, [type]: newState }))
    localStorage.setItem(type, String(newState))
  }

  const handleSelectEvaluator = (event: any) => {
    localStorage.setItem('evaluatorSelection', event.target.value)
    if (event.target.value === 'Development') setConfigState({ ...configState, evaluator: expDev })
    else setConfigState({ ...configState, evaluator: expPub })
  }

  const prettifyInput = (type: 'expression' | 'objects') => {
    const strict =
      type === 'expression' ? configState.strictJsonExpression : configState.strictJsonObjects
    const currentValue = inputState[type]
    const pretty = JSONstringify(currentValue, false, strict)
    if (pretty) setInputState((currState) => ({ ...currState, [type]: pretty }))
    else alert('Invalid input')
  }

  const compactInput = (type: 'expression' | 'objects') => {
    const strict =
      type === 'expression' ? configState.strictJsonExpression : configState.strictJsonObjects
    const currentValue = inputState[type]
    const compact = JSONstringify(currentValue, true, strict)
    if (compact) setInputState((currState) => ({ ...currState, [type]: compact }))
    else alert('Invalid input')
  }

  return (
    <Grid container>
      <Grid item xs sx={{ margin: 1 }}>
        <Typography variant="h4">Local state objects</Typography>
        <Button
          sx={{ margin: 1 }}
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
              checked={configState.strictJsonObjects}
              onChange={() => toggleCheckbox('strictJsonObjects')}
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
          rows={28}
          value={inputState.objects}
          variant="outlined"
          onChange={(e) => updateInput(e?.target?.value, 'objects')}
        />
        <Typography className="invalid-warning" style={{ color: 'red' }}>
          {!isValidState.objects ? 'Invalid object input' : ''}
        </Typography>
      </Grid>
      <Grid item xs sx={{ margin: 1 }}>
        <Typography variant="h4">Input</Typography>
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
              checked={configState.strictJsonExpression}
              onChange={() => toggleCheckbox('strictJsonExpression')}
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
          rows={28}
          value={inputState.expression}
          variant="outlined"
          onChange={(e) => updateInput(e?.target?.value, 'expression')}
        />
      </Grid>
      <Grid item xs sx={{ margin: 1 }}>
        <Typography variant="h4">Output</Typography>
        <InputLabel shrink id="demo-simple-select-placeholder-label-label">
          Evaluator version
        </InputLabel>
        <Select
          id="evalSelect"
          variant="standard"
          value={configState.evaluator === expDev ? 'Development' : 'Published'}
          autoWidth
          onChange={handleSelectEvaluator}
        >
          <MenuItem value={'Development'}>Development</MenuItem>
          <MenuItem value={'Published'}>Published</MenuItem>
        </Select>
        <Card style={{ marginTop: 7 }} variant="outlined">
          <CardContent>
            <Typography variant="body1" component="p">
              {typeof result.result === 'object' && !result.error ? (
                <pre>{JSON.stringify(result.result)}</pre>
              ) : (
                <span className="result-text">{String(result.result)}</span>
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
    const cleanObjectInput = looseJSON(objects)
    if (!Array.isArray(cleanObjectInput)) looseJSON(`${objects}`)
    return true
  } catch {
    return false
  }
}
