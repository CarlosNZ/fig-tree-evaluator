import React, { Dispatch, useEffect, useState } from 'react'
import JSON5 from 'json5'
import {
  Box,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalFooter,
  ModalOverlay,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Textarea,
  Text,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  AccordionPanel,
  Checkbox,
  HStack,
  VStack,
} from '@chakra-ui/react'
import { filterObjectRecursive, setLocalStorage } from './helpers'
import { FigTreeEvaluator, FigTreeOptions } from './_imports'
import { JsonData, JsonEditor } from 'json-edit-react'

const resetFormState = (options: FigTreeOptions) => {
  const baseEndpoint = options.baseEndpoint
  const headers = { ...options.headers }
  const authHeader = headers?.Authorization
  const gqlEndpoint = options.graphQLConnection?.endpoint
  const gqlAuth = options.graphQLConnection?.headers?.Authorization
  const gqlHeaders = { ...options.graphQLConnection?.headers }
  const skipRuntimeTypeCheck = options.skipRuntimeTypeCheck ?? false
  const evaluateFullObject = options.evaluateFullObject ?? false
  const fragments = options.fragments ?? undefined
  delete headers?.Authorization
  delete gqlHeaders?.Authorization
  return {
    baseEndpoint,
    authHeader,
    headers,
    gqlEndpoint,
    gqlAuth,
    gqlHeaders,
    skipRuntimeTypeCheck,
    evaluateFullObject,
    fragments,
    useCache: options.useCache ?? true,
    maxCacheSize: options.maxCacheSize,
    maxCacheTime: options.maxCacheTime,
  }
}

export const OptionsModal = ({
  figTree,
  modalState: { modalOpen, setModalOpen },
}: {
  figTree: FigTreeEvaluator
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  const [formState, setFormState] = useState(resetFormState(figTree.getOptions()))

  useEffect(() => {
    if (modalOpen) {
      setFormState(resetFormState(figTree.getOptions()))
    }
  }, [modalOpen, figTree])

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const {
      baseEndpoint,
      authHeader,
      headers,
      gqlEndpoint,
      gqlAuth,
      gqlHeaders,
      skipRuntimeTypeCheck,
      evaluateFullObject,
      fragments,
      useCache,
      maxCacheSize,
      maxCacheTime,
    } = formState

    const newOptions: FigTreeOptions = {
      ...filterObjectRecursive({
        baseEndpoint,
        headers: { Authorization: authHeader, ...headers },
        graphQLConnection: {
          endpoint: gqlEndpoint ?? '',
          headers: { Authorization: gqlAuth, ...gqlHeaders },
        },
        skipRuntimeTypeCheck,
        evaluateFullObject,
        useCache,
        maxCacheSize,
        maxCacheTime,
      }),
      fragments,
    }

    figTree.updateOptions(newOptions)
    setLocalStorage('options', newOptions)
    setModalOpen(false)
  }

  const labelStyles = { fontSize: 'sm', mb: 0 }

  return (
    <Box>
      <Modal
        size="xl"
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader pb={0}>Evaluator Configuration</ModalHeader>
          <ModalCloseButton />
          <form onSubmit={handleSubmit}>
            <ModalBody>
              <Stack spacing={2}>
                <FormControl id="base-endpoint">
                  <FormLabel {...labelStyles}>Base endpoint:</FormLabel>
                  <Input
                    value={formState.baseEndpoint}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, baseEndpoint: e.target.value }))
                    }
                  />
                </FormControl>
                <FormControl id="auth-token">
                  <FormLabel {...labelStyles}>{'Authorization (eg Bearer <JWT>)'}:</FormLabel>
                  <Textarea
                    fontSize="xs"
                    value={formState.authHeader}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, authHeader: e.target.value }))
                    }
                  />
                </FormControl>
                <FormControl id="headers">
                  <JsonEditor
                    data={formState.headers ?? {}}
                    setData={(data) =>
                      setFormState({
                        ...formState,
                        headers: data as Record<string, string>,
                      })
                    }
                    collapse={Object.keys(formState.headers).length > 0 ? 1 : 0}
                    rootName="Other HTTP headers"
                    rootFontSize={12}
                    maxWidth="100%"
                    theme={{
                      styles: {
                        container: {
                          backgroundColor: 'transparent',
                          boxShadow: 'none',
                          padding: 0,
                          marginTop: 0,
                          marginLeft: '1em',
                        },
                        property: ({ level }) => {
                          if (level === 0)
                            return {
                              fontSize: 12,
                              fontFamily: 'Work Sans, sans-serif',
                              marginRight: '0.5em',
                              // fontWeight: 'bold',
                            }
                        },
                      },
                    }}
                    showCollectionCount="when-closed"
                    jsonParse={JSON5.parse}
                  />
                </FormControl>
                <Accordion allowToggle mt={2}>
                  <AccordionItem>
                    <AccordionButton pl={0}>
                      <Box flex="1" textAlign="left">
                        <Text>
                          <strong>GraphQL</strong> (if different from above)
                        </Text>
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel pt={0} px={0}>
                      <Stack spacing={2}>
                        <FormControl id="gql-endpoint">
                          <FormLabel {...labelStyles}>Endpoint:</FormLabel>
                          <Input
                            value={formState.gqlEndpoint}
                            onChange={(e) =>
                              setFormState((curr) => ({ ...curr, gqlEndpoint: e.target.value }))
                            }
                          />
                        </FormControl>
                        <FormControl id="gql-auth-token">
                          <FormLabel {...labelStyles}>{'Authorization'}:</FormLabel>
                          <Textarea
                            fontSize="xs"
                            value={formState.gqlAuth}
                            onChange={(e) =>
                              setFormState((curr) => ({ ...curr, gqlAuth: e.target.value }))
                            }
                          />
                        </FormControl>
                        <FormControl id="gql-headers">
                          <JsonEditor
                            data={formState.gqlHeaders ?? {}}
                            setData={(data) =>
                              setFormState({
                                ...formState,
                                gqlHeaders: data as Record<string, string>,
                              })
                            }
                            collapse={Object.keys(formState.gqlHeaders).length > 0 ? 1 : 0}
                            rootName="Other headers"
                            rootFontSize={12}
                            maxWidth="100%"
                            theme={{
                              styles: {
                                container: {
                                  backgroundColor: 'transparent',
                                  boxShadow: 'none',
                                  padding: 0,
                                  // marginTop: 0,
                                  marginLeft: '1em',
                                },
                                property: ({ level }) => {
                                  if (level === 0)
                                    return {
                                      fontSize: 12,
                                      fontFamily: 'Work Sans, sans-serif',
                                      marginRight: '0.5em',
                                    }
                                },
                              },
                            }}
                            showCollectionCount="when-closed"
                            jsonParse={JSON5.parse}
                          />
                        </FormControl>
                      </Stack>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
                <FormControl id="fragments">
                  <JsonEditor
                    data={formState.fragments ?? {}}
                    setData={(data) =>
                      setFormState({
                        ...formState,
                        fragments: data as Record<string, JsonData>,
                      })
                    }
                    collapse={0}
                    rootName="Fragments"
                    rootFontSize={12}
                    maxWidth="100%"
                    theme={{
                      styles: {
                        container: {
                          backgroundColor: 'transparent',
                          boxShadow: 'none',
                          padding: 0,
                          marginBottom: '0.5em',
                        },
                        property: ({ level }) => {
                          if (level === 0)
                            return {
                              fontSize: 14,
                              fontFamily: 'Work Sans, sans-serif',
                              marginRight: '0.5em',
                              fontWeight: 'bold',
                            }
                        },
                      },
                    }}
                    showCollectionCount="when-closed"
                    jsonParse={JSON5.parse}
                  />
                </FormControl>
                <hr />
                <VStack align="flex-start" gap={0} mt={1} mb={3}>
                  <Text fontSize="md">
                    <strong>Cache:</strong>
                  </Text>
                  <HStack alignItems="flex-end" mt={-2}>
                    <FormControl id="cache-toggle" flexBasis="60%">
                      <Checkbox
                        isChecked={formState.useCache}
                        onChange={(_) =>
                          setFormState((curr) => ({
                            ...curr,
                            useCache: !formState.useCache,
                          }))
                        }
                        colorScheme="green"
                      >
                        <Text {...labelStyles}>Use cache?</Text>
                      </Checkbox>
                    </FormControl>
                    <FormControl id="cache-size">
                      <FormLabel {...labelStyles}>Size</FormLabel>
                      <Input
                        size="sm"
                        value={formState.maxCacheSize}
                        onChange={(e) =>
                          setFormState((curr) => ({
                            ...curr,
                            maxCacheSize: Number(e.target.value),
                          }))
                        }
                      />
                    </FormControl>
                    <FormControl id="cache-time">
                      <FormLabel {...labelStyles}>Max time (seconds)</FormLabel>
                      <Input
                        size="sm"
                        value={formState.maxCacheTime}
                        onChange={(e) =>
                          setFormState((curr) => ({
                            ...curr,
                            maxCacheTime: Number(e.target.value),
                          }))
                        }
                      />
                    </FormControl>
                  </HStack>
                </VStack>
                <hr />
                <Text fontSize="md">
                  <strong>Miscellaneous:</strong>
                </Text>
                <FormControl id="skip-runtime-check">
                  <Checkbox
                    isChecked={formState.skipRuntimeTypeCheck}
                    onChange={(_) =>
                      setFormState((curr) => ({
                        ...curr,
                        skipRuntimeTypeCheck: !formState.skipRuntimeTypeCheck,
                      }))
                    }
                    colorScheme="green"
                  >
                    <Text fontSize="sm">Skip runtime type checking</Text>
                  </Checkbox>
                </FormControl>
                <FormControl id="evaluate-object">
                  <Checkbox
                    isChecked={formState.evaluateFullObject}
                    onChange={(_) =>
                      setFormState((curr) => ({
                        ...curr,
                        evaluateFullObject: !formState.evaluateFullObject,
                      }))
                    }
                    colorScheme="green"
                  >
                    <Text fontSize="sm">Evaluate full object input</Text>
                  </Checkbox>
                </FormControl>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="green" mr={3} type="submit" onClick={handleSubmit}>
                Save
              </Button>
            </ModalFooter>{' '}
          </form>
        </ModalContent>
      </Modal>
    </Box>
  )
}
