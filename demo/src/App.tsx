import { useRef, useState } from 'react'
import JSON5 from 'json5'
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
import {
  FigTreeEvaluator,
  SQLNodePostgres,
  FigTreeOptions,
  FigTreeEditor,
  isFigTreeError,
  truncateString,
} from './_imports'
import { OptionsModal } from './OptionsModal'
import { getInitOptions, getInitCache, getLocalStorage, setLocalStorage } from './helpers'
// @ts-expect-error No declaration
import { PostgresInterface } from './postgresInterface.js'
import { JsonData, JsonEditor } from 'json-edit-react'
import { Client } from 'pg'
import { demoData, defaultBlurb } from './data'
import { ResultToast } from './ResultToast'
import { useUndo } from './useUndo'
import { InfoModal } from './InfoModal'
const pgConnection = new PostgresInterface() as Client

const initOptions: FigTreeOptions = getInitOptions()
const initData = demoData[0]

const figTree = new FigTreeEvaluator({
  ...initOptions,
  sqlConnection: SQLNodePostgres(pgConnection),
  // returnErrorAsString: true,
  // supportDeprecatedValueNodes: true,
})

const savedCache = getInitCache()
if (savedCache) {
  figTree.setCache(savedCache)
}

function App() {
  const [modalOpen, setModalOpen] = useState(false)
  const [isMobile] = useMediaQuery('(max-width: 635px)')
  const [selectedDataIndex, setSelectedDataIndex] = useState<number>(
    demoData.findIndex((data) => data.name === getLocalStorage('lastSelected'))
  )
  const modalContent = useRef('main')
  const [showInfo, setShowInfo] = useState(!getLocalStorage('visited')?.main ?? true)

  const {
    data: objectData,
    setData: setObjectData,
    UndoRedo: DataUndoRedo,
  } = useUndo(getLocalStorage('objectData') ?? initData.objectData)

  const currentDemoData =
    selectedDataIndex !== undefined ? demoData?.[selectedDataIndex] : undefined

  const jsonEditorOptions = currentDemoData
    ? currentDemoData?.objectJsonEditorProps
    : (getLocalStorage('jsonEditorOptions') ?? {})

  const expressionCollapse = currentDemoData
    ? (currentDemoData?.expressionCollapse ?? 2)
    : (getLocalStorage('expressionCollapse') ?? 2)

  const {
    data: expression,
    setData: setExpression,
    UndoRedo: ExpressionUndoRedo,
  } = useUndo(getLocalStorage('expression') ?? initData.expression)

  const toast = useToast()

  const handleDemoSelect = (selected: number) => {
    setSelectedDataIndex(selected)
    const visited = getLocalStorage('visited')
    if (!visited?.[demoData?.[selected]?.name]) setShowInfo(true)

    const { objectData, expression, figTreeOptions = {} } = demoData[selected]
    setExpression(expression as object)
    setLocalStorage('expression', expression as object)
    if (objectData) {
      setObjectData(objectData)
      setLocalStorage('objectData', objectData)
    }
    setLocalStorage('lastSelected', demoData[selected].name)
    modalContent.current = demoData[selected].name
    figTree.updateOptions(figTreeOptions)
    setLocalStorage('options', figTreeOptions)
  }

  return (
    <Flex px={1} pt={3} minH="100vh" flexDirection="column" justifyContent="space-between">
      <VStack h="100%" w="100%">
        <OptionsModal
          figTree={figTree}
          modalState={{
            modalOpen,
            setModalOpen,
          }}
        />
        <InfoModal
          selected={currentDemoData?.name ?? 'main'}
          content={
            modalContent.current === 'main'
              ? defaultBlurb
              : (currentDemoData?.content ?? defaultBlurb)
          }
          modalState={{
            modalOpen: showInfo,
            closeModal: () => {
              setShowInfo(false)
            },
          }}
        />
        {/** HEADER */}
        <HStack w="100%" px={4} justify="space-between" align="flex-start">
          <VStack align="flex-start" gap={3}>
            <HStack align="flex-end" mt={2} gap={4} flexWrap="wrap">
              <Flex gap={6} align="flex-start">
                <img
                  src="https://raw.githubusercontent.com/CarlosNZ/fig-tree-evaluator/main/images/FigTreeEvaluator_logo_1000.png"
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
        <Flex wrap="wrap" h="100%" w="100%" justify="space-around" gap={5} mb={20}>
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
              setData={setObjectData as (data: JsonData) => void}
              rootName="data"
              collapse={jsonEditorOptions?.collapse ?? 2}
              onUpdate={(result) => {
                console.log(result)
                localStorage.setItem('objectData', JSON.stringify(result.newData))
                if (jsonEditorOptions?.onUpdate) return jsonEditorOptions.onUpdate(result)
              }}
              minWidth="50%"
              enableClipboard={({ stringValue, type }) => {
                toast({
                  title: `${type === 'value' ? 'Value' : 'Path'} copied to clipboard:`,
                  description: truncateString(String(stringValue)),
                  status: 'info',
                  duration: 5000,
                  isClosable: true,
                })
              }}
              showCollectionCount="when-closed"
              jsonParse={JSON5.parse}
              {...jsonEditorOptions}
            />
            <Text align="end" w="100%" maxW={600} fontSize="sm" mt={1} pr={1}>
              Powered by{' '}
              <Link href="https://carlosnz.github.io/json-edit-react/" isExternal>
                json-edit-react
              </Link>
            </Text>
            {DataUndoRedo}
          </Flex>
          {/** EXPRESSION EDITOR COLUMN */}
          <Flex h={'100%'} minW="45%" direction="column" alignItems="center" flexGrow={1} mb={10}>
            <Box maxW={500}>
              <Heading size="md" alignSelf="flex-start">
                FigTree expression
              </Heading>
              <Text>
                Edit the expression, and click any operator "button" to evaluate at that node.
              </Text>
            </Box>
            <FigTreeEditor
              figTree={figTree}
              expression={expression}
              setExpression={setExpression}
              objectData={objectData as Record<string, unknown>}
              onUpdate={({ newData }) => {
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
              onEvaluateError={(err) => {
                if (isFigTreeError(err))
                  toast({
                    title: 'Evaluation error',
                    description: err.prettyPrint,
                    position: 'top',
                    status: 'error',
                    duration: 15000,
                    isClosable: true,
                  })
              }}
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
              stringTruncate={500}
              jsonParse={JSON5.parse}
              collapse={expressionCollapse}
            />
            {ExpressionUndoRedo}
          </Flex>
        </Flex>
      </VStack>
      <HStack
        w="100%"
        px={3}
        pos="fixed"
        bottom={0}
        backgroundColor="background"
        boxShadow="rgba(17, 17, 26, 0.1) 0px 4px 16px, rgba(17, 17, 26, 0.1) 0px 8px 24px, rgba(17, 17, 26, 0.1) 0px 16px 56px;"
        flexWrap="wrap"
      >
        <Text color="accent">
          <strong>Experiment with a range of demo expressions:</strong>
        </Text>
        <Select
          variant="filled"
          backgroundColor="gray.50"
          maxW={300}
          onChange={(e) => handleDemoSelect(Number(e.target.value))}
          value={selectedDataIndex === -1 ? 'Select' : selectedDataIndex}
        >
          <option value="Select" disabled={selectedDataIndex !== undefined}>
            Select an option
          </option>
          {demoData.map((data, index) => (
            <option key={data.name} value={index}>
              {data.name}
            </option>
          ))}
        </Select>
        <Button colorScheme="green" onClick={() => setShowInfo(true)}>
          Info
        </Button>
        <Spacer />
        <HStack alignItems="flex-end" p={2}>
          <Text fontSize="xs" mb={1}>
            fig-tree-evaluator v{figTree.getVersion()}
          </Text>
          <Button colorScheme="green" onClick={() => setModalOpen(true)}>
            Configuration
          </Button>
        </HStack>
      </HStack>
    </Flex>
  )
}

export default App
