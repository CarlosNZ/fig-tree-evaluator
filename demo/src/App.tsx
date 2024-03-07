import { useState } from 'react'
import './App.css'
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  Select,
  Icon,
  HStack,
  VStack,
  Link,
  useToast,
  Spacer,
  useMediaQuery,
} from '@chakra-ui/react'
import { FaNpm, FaExternalLinkAlt, FaGithub } from 'react-icons/fa'
import { FigTreeEvaluator, FigTreeOptions } from './fig-tree-evaluator/src'
// import { FigTreeEvaluator, FigTreeOptions } from 'fig-tree-evaluator'
// Enable instead temporarily when Dev has incompatible changes from Published
// import { FigTreeEvaluator as EvaluatorPublished } from './fig-tree-evaluator/src'
import { FigTreeEditor } from './expression-builder/src'
// import { JsonEditor } from './package'
import { JsonEditor } from 'json-edit-react'
import { OptionsModal } from './OptionsModal'
import { getInitOptions, getInitCache } from './helpers'
import initData from './data/data.json'
import { PostgresInterface } from './postgresInterface'
import { ConfigState } from './types'
import logo from './img/fig_tree_evaluator_logo_512.png'
import { Client } from 'pg'
import { demoData } from './data'

import { truncateString } from './fig-tree-evaluator/src/helpers'
import { ResultToast } from './ResultToast'
import { useUndo } from './useUndo'
const pgConnection = new PostgresInterface() as Client

const initOptions: FigTreeOptions = getInitOptions()

const figTree = new FigTreeEvaluator({ ...initOptions, pgConnection })

const savedCache = getInitCache()
if (savedCache) {
  figTree.setCache(savedCache)
}

function App() {
  const [modalOpen, setModalOpen] = useState(false)
  const [isMobile] = useMediaQuery('(max-width: 635px)')

  const {
    data: objectData,
    setData: setObjectData,
    UndoRedo: DataUndoRedo,
    // setResetPoint: setDataResetPoint,
    // reset: resetData,
  } = useUndo(JSON.parse(localStorage.getItem('objectData')) ?? initData.objects)

  const {
    data: expression,
    setData: setExpression,
    UndoRedo: ExpressionUndoRedo,
    // setResetPoint: setExpressionResetPoint,
    // reset: resetExpression,
  } = useUndo(JSON.parse(localStorage.getItem('expression')) ?? initData.expression)

  const toast = useToast()

  const handleDemoSelect = (selected: number) => {
    const { objectData, expression } = demoData[selected]
    setObjectData(objectData)
    setExpression(expression as object)
    localStorage.setItem('objectData', JSON.stringify(objectData))
    localStorage.setItem('expression', JSON.stringify(expression))
    // TO-DO: Show information modal
  }

  return (
    <Flex px={1} pt={3} minH="100vh" flexDirection="column" justifyContent="space-between">
      <VStack h="100%" w="100%">
        <OptionsModal
          options={figTree.getOptions()}
          updateOptions={(options: FigTreeOptions) => figTree.updateOptions(options)}
          modalState={{ modalOpen, setModalOpen }}
        />
        {/** HEADER */}
        <HStack w="100%" px={4} justify="space-between" align="flex-start">
          <VStack align="flex-start" gap={3}>
            <HStack align="flex-end" mt={2} gap={4} flexWrap="wrap">
              <Flex gap={6} align="flex-start">
                <img
                  src={logo}
                  alt="logo"
                  style={
                    isMobile
                      ? { maxHeight: '4em' }
                      : { maxHeight: '6em', transform: 'translateY(-10px)' }
                  }
                />
                <Box mb={isMobile ? -2 : 8}>
                  <Heading as="h1" size="2xl" variant="other" mb={2}>
                    fig-tree-evaluator
                  </Heading>
                  {!isMobile && (
                    <Heading variant="sub">
                      A highly configurable custom expression tree evaluator •{' '}
                      <Link
                        href="https://github.com/CarlosNZ/fig-tree-evaluator#readme"
                        isExternal
                        color="accent"
                      >
                        Docs <Icon boxSize={4} as={FaExternalLinkAlt} />
                      </Link>
                    </Heading>
                  )}
                </Box>
              </Flex>
            </HStack>
          </VStack>
          <Flex align="center" gap={5}>
            <a
              href="https://github.com/CarlosNZ/fig-tree-evaluator"
              target="_blank"
              rel="noreferrer"
            >
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
        {isMobile && (
          <Heading px={8} variant="sub" fontSize="110%" mb={4} mt={-2}>
            A highly configurable custom expression tree evaluator •{' '}
            <Link
              href="https://github.com/CarlosNZ/fig-tree-evaluator#readme"
              isExternal
              color="accent"
            >
              Docs <Icon boxSize={4} as={FaExternalLinkAlt} />
            </Link>
          </Heading>
        )}
        {/** DATA COLUMN */}
        <Flex wrap="wrap" h="100%" w="100%" justify="space-around" gap={5}>
          <Flex w="45%" direction="column" alignItems="center" flexGrow={1}>
            <Box maxW={500}>
              <Heading size="md" alignSelf="flex-start">
                Application data state
              </Heading>
              <Text>
                This object represents a data structure that is available to{' '}
                <strong>FigTree</strong>. It can be accessed with the{' '}
                <Link
                  href="https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#object_properties"
                  isExternal
                >
                  {' '}
                  getData
                </Link>{' '}
                operator.
              </Text>
            </Box>
            <JsonEditor
              data={objectData}
              rootName="data"
              collapse={2}
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
            {DataUndoRedo}
          </Flex>
          {/** EXPRESSION EDITOR COLUMN */}
          <Flex h={'100%'} minW="45%" direction="column" alignItems="center" flexGrow={1}>
            <Box maxW={500}>
              <Heading size="md" alignSelf="flex-start">
                FigTree expression
              </Heading>
              <Text>
                Edit the expression, and click any operator label to evaluate at that node.
              </Text>
            </Box>
            <FigTreeEditor
              figTree={figTree}
              expression={expression}
              objectData={objectData}
              onUpdate={({ newData }) => {
                setExpression(newData)
                localStorage.setItem('expression', JSON.stringify(newData))
              }}
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
              rootName="expression"
              enableClipboard={({ stringValue, type }) =>
                toast({
                  title: `${type === 'value' ? 'Value' : 'Path'} copied to clipboard:`,
                  description: truncateString(String(stringValue)),
                  status: 'info',
                  duration: 5000,
                  isClosable: true,
                })
              }
              minWidth="90%"
            />
            {ExpressionUndoRedo}
          </Flex>
        </Flex>
      </VStack>
      <HStack w="100%" px={1} mt={10}>
        <Text color="accent">
          <strong>Experiment with a range of demo expressions:</strong>
        </Text>
        <Select
          variant="filled"
          backgroundColor="gray.50"
          maxW={300}
          // placeholder="Select"
          onChange={(e) => handleDemoSelect(Number(e.target.value))}
        >
          <option value="" disabled selected>
            Select an option
          </option>
          {demoData.map((data, index) => (
            <option key={data.name} value={index}>
              {data.name}
            </option>
          ))}
        </Select>
        <Spacer />
        <Box>
          <Button colorScheme="green" onClick={() => setModalOpen(true)}>
            Configuration
          </Button>{' '}
          <Text fontSize="xs" mb={1}>
            fig-tree-evaluator v{figTree.getVersion()}
          </Text>
        </Box>
      </HStack>
    </Flex>
  )
}

export default App
