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
} from '@chakra-ui/react'
import { JSONstringify } from './helpers'

import { EvaluatorOptions } from './expression-evaluator/types'
import { ConfigState } from './types'

const resetFormState = (options: EvaluatorOptions) => {
  const baseEndpoint = options.baseEndpoint
  const headers = options.headers
  const authHeader = headers?.Authorization
  delete headers?.Authorization
  return {
    baseEndpoint,
    authHeader,
    headersText: JSON.stringify(headers),
    headersError: false,
  }
}

export const OptionsModal = ({
  config: { options, setOptions },
  modalState: { modalOpen, setModalOpen },
}: {
  config: { options: EvaluatorOptions; setOptions: Dispatch<React.SetStateAction<ConfigState>> }
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  const [headersError, setHeadersError] = useState(false)
  const [formState, setFormState] = useState(resetFormState(options))

  const formatHeadersText = () => {
    const { headersText } = formState
    if (!headersText) return
    const json = headersText ? JSONstringify(headersText, false, true) : ''
    if (json) {
      setFormState((curr) => ({ ...curr, headersText: json }))
      setHeadersError(false)
    } else setHeadersError(true)
  }

  const handleSubmit = (e: any) => {
    e.preventDefault()
    if (headersError) return
    const { baseEndpoint, authHeader, headersText } = formState
    const newOptions: EvaluatorOptions = { headers: {} }
    if (baseEndpoint) newOptions.baseEndpoint = baseEndpoint
    if (authHeader && newOptions.headers) newOptions.headers.Authorization = authHeader
    if (headersText) newOptions.headers = { ...newOptions.headers, ...JSON.parse(headersText) }

    console.log(options)

    setOptions((curr) => ({ ...curr, options: newOptions }))
    setModalOpen(false)
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
                    fontSize="sm"
                    value={formState.authHeader}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, authHeader: e.target.value }))
                    }
                  />
                </FormControl>
                <FormControl id="headers" isInvalid={headersError}>
                  <FormLabel fontSize="sm">{'Other headers (JSON object)'}:</FormLabel>
                  <Textarea
                    fontSize="sm"
                    fontFamily="monospace"
                    value={formState.headersText}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, headersText: e.target.value }))
                    }
                    onBlur={formatHeadersText}
                  />
                  <FormErrorMessage>Invalid Input</FormErrorMessage>
                </FormControl>
                <Text>
                  <strong>GraphQL (if different from above)</strong>
                </Text>
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
      {/* 
      BaseEndpoint
      Authtoken
      Additional Headers
      GraphQL:
        Endpoint
        Auth Token
        Additional Headers
      Postgres connection
      
      */}
    </Box>
  )
}
