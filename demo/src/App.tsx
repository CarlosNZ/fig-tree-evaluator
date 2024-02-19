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
import { JsonEditor } from 'json-edit-react'
import { OptionsModal } from './OptionsModal'
import { getInitOptions, getInitCache, displayResult } from './helpers'
import functions from './customFunctions'
import initData from './data.json'
import { PostgresInterface } from './postgresInterface'
import { ConfigState } from './types'
import logo from './img/fig_tree_evaluator_logo_512.png'
import { Client } from 'pg'
import { testExpressions } from './testExpressions'

import looseJSON from 'loose-json'
import { truncateString } from './fig-tree-evaluator/src/helpers'
import { ResultToast } from './ResultToast'
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
  const [modalOpen, setModalOpen] = useState(false)
  const [objectData, setObjectData] = useState<object>(
    JSON.parse(localStorage.getItem('objectData')) ?? initData.objects
  )
  const toast = useToast()

  const [evaluator, setEvaluator] = useState<EvaluatorDev | EvaluatorPublished>(
    process.env.NODE_ENV === 'development'
      ? localStorage.getItem('evaluatorSelection') === 'Development'
        ? figTreeDev
        : figTreePub
      : figTreePub
  )

  const initialExpression = JSON.parse(localStorage.getItem('expression')) ?? initData.expression

  const handleSelectEvaluator = (event: any) => {
    localStorage.setItem('evaluatorSelection', event.target.value)
    setEvaluator(event.target.value === 'Development' ? figTreeDev : figTreePub)
  }

  return (
    <Center h={'100vh'}>
      <OptionsModal
        options={evaluator.getOptions()}
        updateOptions={(options: FigTreeOptions) => evaluator.updateOptions(options)}
        modalState={{ modalOpen, setModalOpen }}
      />
      <VStack h="100%" w="100%">
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
          <Box p={2} minW="45%">
            <Heading size="md">Local data state</Heading>
            <Flex gap={2} justifyContent="flex-start" my={3}></Flex>
            <JsonEditor
              data={objectData}
              rootName="data"
              collapse={1}
              onUpdate={({ newData }) => {
                setObjectData(newData)
                localStorage.setItem('objectData', JSON.stringify(newData))
              }}
              minWidth="50%"
              enableClipboard={({ stringValue, type }) =>
                toast({
                  title: `${type === 'value' ? 'Value' : 'Path'} copied to clipboard:`,
                  description: truncateString(String(stringValue)),
                  status: 'info',
                  duration: 5000,
                  isClosable: true,
                })
              }
            />
          </Box>
          <Box h={'100%'} p={2} minW="45%">
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
              expression={initialExpression}
              objectData={objectData}
              onUpdate={({ newData }) =>
                localStorage.setItem('expression', JSON.stringify(newData))
              }
              onEvaluate={(value: unknown) =>
                toast({
                  title: 'Evaluation result',
                  description: displayResult(value),
                  position: 'top',
                  status: 'success',
                  duration: 5000,
                  isClosable: true,
                })
              }
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
              rootName="FigTreeExpression"
              enableClipboard={({ stringValue, type }) =>
                toast({
                  title: `${type === 'value' ? 'Value' : 'Path'} copied to clipboard:`,
                  description: truncateString(String(stringValue)),
                  status: 'info',
                  duration: 5000,
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
