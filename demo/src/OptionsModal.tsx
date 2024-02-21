import React, { Dispatch, useState } from 'react'
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
  FormErrorMessage,
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
import { filterObjectRecursive } from './helpers'
import { FigTreeOptions } from './fig-tree-evaluator/src'

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
    headersText: JSON.stringify(headers),
    headersError: false,
    gqlEndpoint,
    gqlAuth,
    gqlHeadersText: JSON.stringify(gqlHeaders),
    gqlHeadersError: false,
    skipRuntimeTypeCheck,
    evaluateFullObject,
    fragmentsText: JSON.stringify(fragments, null, 2),
    fragmentsError: false,
    useCache: options.useCache ?? true,
    maxCacheSize: options.maxCacheSize,
    maxCacheTime: options.maxCacheTime,
  }
}

export const OptionsModal = ({
  options,
  updateOptions,
  modalState: { modalOpen, setModalOpen },
}: {
  options: FigTreeOptions
  updateOptions: (options: FigTreeOptions) => void
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  const [formState, setFormState] = useState(resetFormState(options))

  const formatHeadersText = (text: {
    [key in 'headersText' | 'gqlHeadersText' | 'fragmentsText']?: string
  }) => {
    const [key, value] = Object.entries(text)[0]
    if (!value) return
    const json = value ? JSONstringify(value, false, true) : ''
    const errorKey =
      key === 'headersText'
        ? 'headersError'
        : key === 'gqlHeadersText'
        ? 'gqlHeadersError'
        : 'fragmentsError'
    if (json) {
      setFormState((curr) => ({ ...curr, [key]: json, [errorKey]: false }))
    } else setFormState((curr) => ({ ...curr, [errorKey]: true }))
  }

  const handleSubmit = (e: any) => {
    e.preventDefault()
    if (formState.headersError || formState.gqlHeadersError) return
    const {
      baseEndpoint,
      authHeader,
      headersText,
      gqlEndpoint,
      gqlAuth,
      gqlHeadersText,
      skipRuntimeTypeCheck,
      evaluateFullObject,
      fragmentsText,
      useCache,
      maxCacheSize,
      maxCacheTime,
    } = formState

    const headers = headersText ? JSON.parse(headersText) : {}
    const gqlHeaders = gqlHeadersText ? JSON.parse(gqlHeadersText) : {}
    const fragments = fragmentsText ? JSON.parse(fragmentsText) : {}

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

    updateOptions(newOptions)
    localStorage.setItem('options', JSON.stringify(newOptions))
    setModalOpen(false)
    resetFormState(options)
  }

  return (
    <Box>
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Evaluator Configuration</ModalHeader>
          <ModalCloseButton />
          <form onSubmit={handleSubmit}>
            <ModalBody>
              <Stack spacing={4}>
                <FormControl id="base-endpoint">
                  <FormLabel fontSize="sm">Base endpoint:</FormLabel>
                  <Input
                    value={formState.baseEndpoint}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, baseEndpoint: e.target.value }))
                    }
                  />
                </FormControl>
                <FormControl id="auth-token">
                  <FormLabel fontSize="sm">{'Authorization (eg Bearer <JWT>)'}:</FormLabel>
                  <Textarea
                    fontSize="xs"
                    value={formState.authHeader}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, authHeader: e.target.value }))
                    }
                  />
                </FormControl>
                <FormControl id="headers" isInvalid={formState.headersError}>
                  <FormLabel fontSize="sm">{'Other headers (JSON object)'}:</FormLabel>
                  <Textarea
                    fontSize="xs"
                    fontFamily="monospace"
                    value={formState.headersText}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, headersText: e.target.value }))
                    }
                    onBlur={(e) => formatHeadersText({ headersText: e.target.value })}
                  />
                  <FormErrorMessage>Invalid Input</FormErrorMessage>
                </FormControl>

                <Accordion allowToggle>
                  <AccordionItem>
                    <AccordionButton>
                      <h2>
                        <Box flex="1" textAlign="left">
                          <Text>GraphQL (if different from above)</Text>
                        </Box>
                      </h2>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel>
                      <FormControl id="gql-endpoint">
                        <FormLabel fontSize="sm">Endpoint:</FormLabel>
                        <Input
                          value={formState.gqlEndpoint}
                          onChange={(e) =>
                            setFormState((curr) => ({ ...curr, gqlEndpoint: e.target.value }))
                          }
                        />
                      </FormControl>
                      <FormControl id="gql-auth-token">
                        <FormLabel fontSize="sm">{'Authorization'}:</FormLabel>
                        <Textarea
                          fontSize="xs"
                          value={formState.gqlAuth}
                          onChange={(e) =>
                            setFormState((curr) => ({ ...curr, gqlAuth: e.target.value }))
                          }
                        />
                      </FormControl>
                      <FormControl id="gql-headers" isInvalid={formState.gqlHeadersError}>
                        <FormLabel fontSize="sm">{'Other headers (JSON object)'}:</FormLabel>
                        <Textarea
                          fontSize="xs"
                          fontFamily="monospace"
                          value={formState.gqlHeadersText}
                          onChange={(e) =>
                            setFormState((curr) => ({ ...curr, gqlHeadersText: e.target.value }))
                          }
                          onBlur={(e) => formatHeadersText({ gqlHeadersText: e.target.value })}
                        />
                        <FormErrorMessage>Invalid Input</FormErrorMessage>
                      </FormControl>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
                <Accordion allowToggle>
                  <AccordionItem>
                    <AccordionButton>
                      <h2>
                        <Box flex="1" textAlign="left">
                          <Text>Fragments (JSON)</Text>
                        </Box>
                      </h2>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel>
                      <FormControl id="fragments" isInvalid={formState.fragmentsError}>
                        <Textarea
                          fontSize="xs"
                          fontFamily="monospace"
                          rows={12}
                          value={formState.fragmentsText}
                          onChange={(e) =>
                            setFormState((curr) => ({ ...curr, fragmentsText: e.target.value }))
                          }
                          onBlur={(e) => formatHeadersText({ fragmentsText: e.target.value })}
                        />
                        <FormErrorMessage>Invalid Input</FormErrorMessage>
                      </FormControl>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
                <VStack align="flex-start">
                  <Text fontSize="md">
                    <strong>Cache:</strong>
                  </Text>
                  <FormControl id="evaluate-object" mt="2 !important">
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
                      <Text fontSize="sm">Use cache?</Text>
                    </Checkbox>
                  </FormControl>
                  <HStack>
                    <FormControl id="cache-size">
                      <FormLabel fontSize="smaller">Size</FormLabel>
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
                      <FormLabel fontSize="smaller">Max time (seconds)</FormLabel>
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
                <Text fontSize="md">
                  <strong>Miscellaneous:</strong>
                </Text>
                <FormControl id="skip-runtime-check" mt="2 !important">
                  <Checkbox
                    isChecked={formState.skipRuntimeTypeCheck}
                    onChange={(e) =>
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
                <FormControl id="evaluate-object" mt="2 !important">
                  <Checkbox
                    isChecked={formState.evaluateFullObject}
                    onChange={(e) =>
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
