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
  HStack,
  VStack,
  Link,
  Image,
  useToast,
} from '@chakra-ui/react'
import {
  FigTreeEvaluator as EvaluatorDev,
  // FigTreeOptions,
} from './fig-tree-evaluator/src'
import {
  FigTreeEvaluator as EvaluatorPublished,
  FigTreeEvaluator,
  FigTreeOptions,
} from 'fig-tree-evaluator'
// Enable instead temporarily when Dev has incompatible changes from Published
// import { FigTreeEvaluator as EvaluatorPublished } from './fig-tree-evaluator/src'
import { FigTreeEditor } from './expression-builder/src'
import { OptionsModal } from './OptionsModal'
import {
  getInitOptions,
  JSONstringify,
  JSONstringifyLoose,
  validateExpression,
  validateData,
  getInitCache,
} from './helpers'
import functions from './customFunctions'
import initData from './data.json'
import { PostgresInterface } from './postgresInterface'
import useDebounce from './useDebounce'
import { InputState, IsValidState, ConfigState, Result } from './types'
import logo from './img/fig_tree_evaluator_logo_512.png'
import { Client } from 'pg'
import { testExpressions } from './testExpressions'

import looseJSON from 'loose-json'
// const looseJSON = require('loose-json')
const pgConnection = new PostgresInterface() as Client

const initOptions: FigTreeOptions = getInitOptions()
initOptions.functions = functions

const figTreeDev = new EvaluatorDev({ ...initOptions, pgConnection })
const figTreePub = new EvaluatorPublished({ ...initOptions, pgConnection })

const savedCache = getInitCache()
if (savedCache) {
  figTreeDev.setCache(savedCache)
  figTreePub.setCache(savedCache)
}

function App() {
  const [debounceOutput, setDebounceInput] = useDebounce<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

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
        ? figTreeDev
        : figTreePub
      : figTreePub
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
          // @ts-ignore
          setResult({ output: null, error: result.error })
        else setResult({ output: result, error: false })
        setLoading(false)
        if (evaluator.getOptions().useCache)
          localStorage.setItem('cache', JSON.stringify(evaluator.getCache()))
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
    setEvaluator(event.target.value === 'Development' ? figTreeDev : figTreePub)
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
          <Box h={'100%'} p={2} minW={375} w="50%">
            <Heading size="md">Input</Heading>
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
                w="50%"
                value={localStorage.getItem('evaluatorSelection') ?? 'Published'}
                onChange={handleSelectEvaluator}
              >
                <option value={'Development'}>Development</option>
                <option value={'Published'}>Published</option>
              </Select>
            </Flex>
            <FigTreeEditor
              figTree={evaluator as FigTreeEvaluator}
              expression={inputState.expression}
              options={{ data: looseJSON(inputState.data) }}
              onEvaluate={(value) =>
                toast({
                  // title: 'Evaluation successful',
                  description: String(value),
                  position: 'top',
                  status: 'success',
                  duration: 5000,
                  isClosable: true,
                })
              }
              onEvaluateStart={() => console.log('Evaluating...')}
              onEvaluateError={(err) =>
                toast({
                  title: 'Evaluation error',
                  description: String(err),
                  position: 'top',
                  status: 'error',
                  duration: 15000,
                  isClosable: true,
                })
              }
            />
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
