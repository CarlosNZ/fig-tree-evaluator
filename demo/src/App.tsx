import { useState, useEffect } from 'react'
import './App.css'
import {
  Box,
  Center,
  Flex,
  Heading,
  Text,
  Button,
  Checkbox,
  Select,
  Textarea,
  Spinner,
} from '@chakra-ui/react'
import EvaluatorDev from './expression-evaluator/evaluator'
import EvaluatorPublished from 'expression-evaluator'
// CHANGE THIS AFTER FIRST PUBLISH
// import evaluatorPublished from '@openmsupply/expression-evaluator'
import { OptionsModal } from './OptionsModal'
import {
  getInitOptions,
  JSONstringify,
  JSONstringifyLoose,
  validateExpression,
  validateObjects,
} from './helpers'
import initData from './data.json'
import { PostgresInterface } from './postgresInterface'
import useDebounce from './useDebounce'
import { InputState, IsValidState, ConfigState, Result } from './types'
import { EvaluatorOptions } from './expression-evaluator/types'

const looseJSON = require('loose-json')
const pgConnection = new PostgresInterface()

const initOptions = getInitOptions()

const expDev = new EvaluatorDev({ ...initOptions, pgConnection })
const expPub = new EvaluatorPublished({ ...initOptions, pgConnection })

function App() {
  const [debounceOutput, setDebounceInput] = useDebounce<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [inputState, setInputState] = useState<InputState>({
    expression: localStorage.getItem('inputText') || JSONstringifyLoose(initData.expression),
    objects: localStorage.getItem('objectText') || JSONstringifyLoose(initData.objects),
  })
  const [result, setResult] = useState<Result>({ output: null, error: false })
  const [isValidState, setIsValidState] = useState<IsValidState>({
    expression: validateExpression(inputState.expression),
    objects: validateObjects(inputState.objects),
  })

  const [configState, setConfigState] = useState<ConfigState>({
    strictJsonExpression: localStorage.getItem('strictJsonExpression') === 'true' ?? false,
    strictJsonObjects: localStorage.getItem('strictJsonObjects') === 'true' ?? false,
  })

  const [evaluator, setEvaluator] = useState<EvaluatorDev | EvaluatorPublished>(
    localStorage.getItem('evaluatorSelection') === 'Development' ? expDev : expPub
  )

  const updateOptions = (options: EvaluatorOptions) => {
    evaluator.updateOptions(options)
    reEvaluate()
  }

  const reEvaluate = () => {
    setLoading(true)
    const { expression, objects } = inputState
    const expressionValid = validateExpression(inputState.expression)
    const objectsValid = validateObjects(inputState.objects)
    setIsValidState({ expression: expressionValid, objects: objectsValid })

    if (!expressionValid || !objectsValid) {
      setResult({ output: 'Invalid Input', error: false })
      setLoading(false)
      return
    }

    evaluator
      .evaluate(looseJSON(expression), { objects: looseJSON(objects) })
      .then((result) => {
        if (result instanceof Object && 'error' in result)
          setResult({ output: null, error: result.error })
        else setResult({ output: result, error: false })
        setLoading(false)
      })
      .catch((error) => {
        setResult({ output: null, error: error.message })
        setLoading(false)
      })
  }

  useEffect(() => {
    const { expression, objects } = inputState
    localStorage.setItem('inputText', expression)
    localStorage.setItem('objectText', objects)
    reEvaluate()
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
    setEvaluator(event.target.value === 'Development' ? expDev : expPub)
    reEvaluate()
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
    <Center h={'100vh'}>
      <OptionsModal
        options={evaluator.getOptions()}
        updateOptions={updateOptions}
        modalState={{ modalOpen, setModalOpen }}
      />
      <Box w={'33%'} h={'100%'} p={2}>
        <Heading>Local state objects</Heading>
        <Flex gap={2} justifyContent="flex-start" my={3}>
          <Button colorScheme="blue" onClick={() => prettifyInput('objects')}>
            Prettify
          </Button>
          <Button colorScheme="blue" onClick={() => compactInput('objects')}>
            Compact
          </Button>
          <Checkbox
            isChecked={configState.strictJsonObjects}
            onChange={() => toggleCheckbox('strictJsonObjects')}
          >
            Quoted field names
          </Checkbox>
        </Flex>
        <Textarea
          h={'85%'}
          fontFamily="monospace"
          value={inputState.objects}
          onChange={(e) => updateInput(e?.target?.value, 'objects')}
        />
        <Text color="red">{!isValidState.objects ? 'Invalid object input' : ''}</Text>
      </Box>
      <Box w={'33%'} h={'100%'} p={2}>
        <Heading>Input</Heading>
        <Flex gap={2} justifyContent="flex-start" my={3}>
          <Button colorScheme="blue" onClick={() => prettifyInput('expression')}>
            Prettify
          </Button>
          <Button colorScheme="blue" onClick={() => compactInput('expression')}>
            Compact
          </Button>
          <Checkbox
            isChecked={configState.strictJsonExpression}
            onChange={() => toggleCheckbox('strictJsonExpression')}
          >
            Quoted field names
          </Checkbox>
        </Flex>
        <Textarea
          h={'85%'}
          fontFamily="monospace"
          value={inputState.expression}
          onChange={(e) => updateInput(e?.target?.value, 'expression')}
        />
      </Box>
      <Box w={'33%'} h={'100%'} p={2}>
        <Heading>Output</Heading>
        <Flex gap={4} alignItems="center" mb={6}>
          <Text>Evaluator version:</Text>
          <Select
            id="evalSelect"
            variant="outline"
            w={'50%'}
            value={localStorage.getItem('evaluatorSelection') ?? 'Published'}
            onChange={handleSelectEvaluator}
          >
            <option value={'Development'}>Development</option>
            <option value={'Published'}>Published</option>
          </Select>
        </Flex>
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          border="1px solid"
          borderColor="lightgrey"
          borderRadius={3}
          minHeight={20}
          mx={5}
          p={3}
        >
          {loading ? <Spinner /> : <ResultText result={result} />}
        </Box>
        <Button
          style={{ position: 'fixed', bottom: 20, right: 20 }}
          colorScheme="blue"
          onClick={() => setModalOpen(true)}
        >
          Configuration
        </Button>
      </Box>
    </Center>
  )
}

export default App

const ResultText = ({ result }: { result: Result }) => {
  if (result.error)
    return (
      <Text fontSize={'xl'} color="red">
        {result.error}
      </Text>
    )
  if (typeof result.output === 'object')
    return (
      <Text fontSize={'md'} fontFamily="monospace">
        <pre> {JSON.stringify(result.output, null, 2)}</pre>
      </Text>
    )
  return <Text fontSize={'xl'}>{String(result.output)}</Text>
}