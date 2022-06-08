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
} from '@chakra-ui/react'
import { JSONstringify, filterObjectRecursive } from './helpers'
import { EvaluatorOptions } from './expression-evaluator/types'

const resetFormState = (options: EvaluatorOptions) => {
  const baseEndpoint = options.baseEndpoint
  const headers = { ...options.headers }
  const authHeader = headers?.Authorization
  const gqlEndpoint = options.graphQLConnection?.endpoint
  const gqlAuth = options.graphQLConnection?.headers?.Authorization
  const gqlHeaders = { ...options.graphQLConnection?.headers }
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
  }
}

export const OptionsModal = ({
  options,
  updateOptions,
  modalState: { modalOpen, setModalOpen },
}: {
  options: EvaluatorOptions
  updateOptions: (options: EvaluatorOptions) => void
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  const [formState, setFormState] = useState(resetFormState(options))

  const formatHeadersText = (text: { [key in 'headersText' | 'gqlHeadersText']?: string }) => {
    const [key, value] = Object.entries(text)[0]
    if (!value) return
    const json = value ? JSONstringify(value, false, true) : ''
    const errorKey = key === 'headersText' ? 'headersError' : 'gqlHeadersError'
    if (json) {
      setFormState((curr) => ({ ...curr, [key]: json, [errorKey]: false }))
    } else setFormState((curr) => ({ ...curr, [errorKey]: true }))
  }

  const handleSubmit = (e: any) => {
    e.preventDefault()
    if (formState.headersError || formState.gqlHeadersError) return
    const { baseEndpoint, authHeader, headersText, gqlEndpoint, gqlAuth, gqlHeadersText } =
      formState

    const headers = headersText ? JSON.parse(headersText) : {}
    const gqlHeaders = gqlHeadersText ? JSON.parse(gqlHeadersText) : {}

    const newOptions: EvaluatorOptions = filterObjectRecursive({
      baseEndpoint,
      headers: { Authorization: authHeader, ...headers },
      graphQLConnection: {
        endpoint: gqlEndpoint ?? '',
        headers: { Authorization: gqlAuth, ...gqlHeaders },
      },
    })

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
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="blue" mr={3} type="submit" onClick={handleSubmit}>
                Save
              </Button>
            </ModalFooter>{' '}
          </form>
        </ModalContent>
      </Modal>
    </Box>
  )
}
