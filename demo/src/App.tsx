import { useState } from 'react'
import './App.css'
import {
  Box,
  Center,
  Flex,
  Heading,
  Text,
  Button,
  Select,
  Icon,
  HStack,
  VStack,
  Link,
  Image,
  useToast,
} from '@chakra-ui/react'
import { FaNpm, FaExternalLinkAlt, FaGithub } from 'react-icons/fa'
import { BiReset } from 'react-icons/bi'
import { AiOutlineCloudUpload } from 'react-icons/ai'
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
// import { JsonEditor } from './package'
import { JsonEditor } from 'json-edit-react'
import { OptionsModal } from './OptionsModal'
import { getInitOptions, getInitCache } from './helpers'
import functions from './customFunctions'
import initData from './data.json'
import { PostgresInterface } from './postgresInterface'
import { ConfigState } from './types'
import logo from './img/fig_tree_evaluator_logo_512.png'
import { Client } from 'pg'
import { testExpressions } from './testExpressions'

import { truncateString } from './fig-tree-evaluator/src/helpers'
import { ResultToast } from './ResultToast'
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
    <Center h={'100vh'} px={8} pt={4}>
      <OptionsModal
        options={evaluator.getOptions()}
        updateOptions={(options: FigTreeOptions) => evaluator.updateOptions(options)}
        modalState={{ modalOpen, setModalOpen }}
      />
      <VStack h="100%" w="100%">
        {/** HEADER */}
        <HStack w="100%" justify="space-between" align="flex-start">
          <VStack align="flex-start" gap={3}>
            <HStack align="flex-end" mt={2} gap={4} flexWrap="wrap">
              <Flex gap={6} align="center">
                <img src={logo} alt="logo" style={{ maxHeight: '6em' }} />
                <div>
                  <Heading as="h1" size="2xl" variant="other" mb={4}>
                    fig-tree-evaluator
                  </Heading>
                  <Heading variant="sub">
                    A highly configurable custom expression tree evaluator •{' '}
                    <Link
                      href="https://github.com/CarlosNZ/json-edit-react#readme"
                      isExternal
                      color="accent"
                    >
                      Docs <Icon boxSize={4} as={FaExternalLinkAlt} />
                    </Link>
                  </Heading>
                </div>
              </Flex>
            </HStack>
          </VStack>
          <Flex align="center" gap={5}>
            <a href="https://github.com/CarlosNZ/json-edit-react" target="_blank" rel="noreferrer">
              <Icon boxSize="2em" as={FaGithub} color="accent" />
            </a>
            <a
              href="https://www.npmjs.com/package/fig-tree-evaluator"
              target="_blank"
              rel="noreferrer"
            >
              <Icon boxSize="3em" as={FaNpm} color="accent" />
            </a>
          </Flex>
        </HStack>
        <div>SELECT DEMO DATA</div>
        {/** DATA COLUMN */}
        <Flex wrap="wrap" h="100%" w="100%" justify="space-around" gap={5}>
          <Box p={2} minW="45%">
            {/* <Heading size="md">Local data state</Heading> */}
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
          {/** EXPRESSION EDITOR COLUMN */}
          <Box h={'100%'} p={2} minW="45%">
            {/* <Flex
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
            </Flex> */}
            <FigTreeEditor
              figTree={evaluator as FigTreeEvaluator}
              expression={initialExpression}
              objectData={objectData}
              onUpdate={({ newData }) =>
                localStorage.setItem('expression', JSON.stringify(newData))
              }
              onEvaluate={(value: unknown) =>
                toast({
                  render: ({ onClose }) => (
                    <ResultToast title="Evaluation result" value={value} close={onClose} />
                  ),
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
