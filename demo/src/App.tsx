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
  HStack,
  VStack,
  Link,
  Image,
} from '@chakra-ui/react'
import EvaluatorDev from './fig-tree-evaluator/src'
import EvaluatorPublished from 'fig-tree-evaluator'
import { OptionsModal } from './OptionsModal'
import {
  getInitOptions,
  JSONstringify,
  JSONstringifyLoose,
  validateExpression,
  validateData,
} from './helpers'
import functions from './customFunctions'
import initData from './data.json'
import { PostgresInterface } from './postgresInterface'
import useDebounce from './useDebounce'
import { InputState, IsValidState, ConfigState, Result } from './types'
import { FigTreeOptions } from './fig-tree-evaluator/src/types'
import logo from './img/fig_tree_evaluator_logo_512.png'

const looseJSON = require('loose-json')
const pgConnection = new PostgresInterface()

const initOptions: FigTreeOptions = getInitOptions()
initOptions.functions = functions

const expDev = new EvaluatorDev({ ...initOptions, pgConnection })
const expPub = new EvaluatorPublished({ ...initOptions, pgConnection })

function App() {
  const [debounceOutput, setDebounceInput] = useDebounce<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [inputState, setInputState] = useState<InputState>({
    expression: localStorage.getItem('inputText') || JSONstringifyLoose(initData.expression),
    data: localStorage.getItem('objectText') || JSONstringifyLoose(initData.objects),
  })
  const [result, setResult] = useState<Result>({ output: null, error: false })
  const [isValidState, setIsValidState] = useState<IsValidState>({
    expression: validateExpression(inputState.expression),
    data: validateData(inputState.data),
  })

  const [configState, setConfigState] = useState<ConfigState>({
    strictJsonExpression: localStorage.getItem('strictJsonExpression') === 'true' ?? false,
    strictJsonData: localStorage.getItem('strictJsonData') === 'true' ?? false,
  })

  const [evaluator, setEvaluator] = useState<EvaluatorDev | EvaluatorPublished>(
    process.env.NODE_ENV === 'development'
      ? localStorage.getItem('evaluatorSelection') === 'Development'
        ? expDev
        : expPub
      : expPub
  )

  const updateOptions = (options: FigTreeOptions) => {
    evaluator.updateOptions(options)
    reEvaluate()
  }

  const reEvaluate = () => {
    setLoading(true)
    const { expression, data } = inputState
    const expressionValid = validateExpression(inputState.expression)
    const dataValid = validateData(inputState.data)
    setIsValidState({ expression: expressionValid, data: dataValid })

    if (!expressionValid || !dataValid) {
      setResult({ output: null, error: 'Invalid Input' })
      setLoading(false)
      return
    }

    evaluator
      .evaluate(looseJSON(expression), { objects: looseJSON(data) })
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
    const { expression, data } = inputState
    localStorage.setItem('inputText', expression)
    localStorage.setItem('objectText', data)
    reEvaluate()
  }, [debounceOutput, configState]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateInput = (text: string, type: 'expression' | 'data') => {
    setInputState({ ...inputState, [type]: text })
    setDebounceInput(text)
  }

  const toggleCheckbox = (type: 'strictJsonData' | 'strictJsonExpression') => {
    const newState = !configState[type]
    setConfigState((prev) => ({ ...prev, [type]: newState }))
    localStorage.setItem(type, String(newState))
  }

  const handleSelectEvaluator = (event: any) => {
    localStorage.setItem('evaluatorSelection', event.target.value)
    setEvaluator(event.target.value === 'Development' ? expDev : expPub)
    reEvaluate()
  }

  const prettifyInput = (type: 'expression' | 'data') => {
    const strict =
      type === 'expression' ? configState.strictJsonExpression : configState.strictJsonData
    const currentValue = inputState[type]
    const pretty = JSONstringify(currentValue, false, strict)
    if (pretty) setInputState((currState) => ({ ...currState, [type]: pretty }))
    else alert('Invalid input')
  }

  const compactInput = (type: 'expression' | 'data') => {
    const strict =
      type === 'expression' ? configState.strictJsonExpression : configState.strictJsonData
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
      <VStack h="100%">
        <HStack justifyContent="space-between" width="100%" mt={2} px={4} maxH={100}>
          <Image src={logo} h="100%" />
          <VStack align="flex-end">
            <Link
              href="https://github.com/CarlosNZ/fig-tree-evaluator"
              isExternal
              color="#28659e"
              fontSize="sm"
            >
              https://github.com/CarlosNZ/fig-tree-evaluator
            </Link>
            <Link
              href="https://www.npmjs.com/package/fig-tree-evaluator"
              isExternal
              color="#28659e"
              fontSize="sm"
            >
              https://www.npmjs.com/package/fig-tree-evaluator
            </Link>
          </VStack>
        </HStack>
        <Flex wrap="wrap" h="100%" w="100%" justify="space-around" gap={5}>
          <Box h={'100%'} p={2} minW={375}>
            <Heading size="md">Local data state</Heading>
            <Flex gap={2} justifyContent="flex-start" my={3}>
              <Button colorScheme="blue" onClick={() => prettifyInput('data')}>
                Prettify
              </Button>
              <Button colorScheme="blue" onClick={() => compactInput('data')}>
                Compact
              </Button>
              <Checkbox
                isChecked={configState.strictJsonData}
                onChange={() => toggleCheckbox('strictJsonData')}
              >
                Quoted field names
              </Checkbox>
            </Flex>
            <Textarea
              h={'85%'}
              fontFamily="monospace"
              value={inputState.data}
              onChange={(e) => updateInput(e?.target?.value, 'data')}
            />
            <Text color="red">{!isValidState.data ? 'Invalid object input' : ''}</Text>
          </Box>
          <Box h={'100%'} p={2} minW={375}>
            <Heading size="md">Input</Heading>
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
          <Box h={'100%'} p={2} minW={375} maxW="33%">
            <Heading size="md">Output</Heading>
            <Flex
              gap={4}
              alignItems="center"
              mb={6}
              style={{ visibility: process.env.NODE_ENV === 'development' ? 'visible' : 'hidden' }}
            >
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
            <Box style={{ position: 'fixed', bottom: 20, right: 20 }}>
              <Button colorScheme="blue" onClick={() => setModalOpen(true)}>
                Configuration
              </Button>{' '}
              <Text fontSize="xs" mb={1}>
                fig-tree-evaluator v{evaluator.getVersion()}
              </Text>
            </Box>
          </Box>
        </Flex>
      </VStack>
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
  if (typeof result.output === 'string')
    return <Text fontSize={'xl'}>"{String(result.output)}"</Text>
  return <Text fontSize={'xl'}>{String(result.output)}</Text>
}
