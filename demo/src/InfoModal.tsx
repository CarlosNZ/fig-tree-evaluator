import React, { Dispatch, useState } from 'react'
import { compiler } from 'markdown-to-jsx'
// import Markdown from 'react-markdown'
import {
  Box,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalFooter,
  ModalOverlay,
  Heading,
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

export const InfoModal = ({
  content,
  modalState: { modalOpen, setModalOpen },
}: {
  content: string
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  return (
    <Box>
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Evaluator Configuration</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={2}>
              {compiler(content, {
                overrides: { h1: { component: Heading, props: { as: 'h1', size: 'lg' } } },
              })}
            </Stack>
          </ModalBody>
          <ModalFooter></ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}
