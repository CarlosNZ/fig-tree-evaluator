import React, { Dispatch } from 'react'
import { compiler } from 'markdown-to-jsx'
import {
  Box,
  Modal,
  ModalBody,
  ModalContent,
  ModalCloseButton,
  ModalFooter,
  ModalOverlay,
  Heading,
  Stack,
} from '@chakra-ui/react'
import { getLocalStorage, setLocalStorage } from './helpers'

export const InfoModal = ({
  selected,
  content,
  modalState: { modalOpen, setModalOpen },
}: {
  selected: string
  content: string
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  return (
    <Box>
      <Modal
        size="4xl"
        isOpen={modalOpen}
        onClose={() => {
          const currentVisited = getLocalStorage('visited') ?? {}
          currentVisited[selected] = true
          setLocalStorage('visited', currentVisited)
          setModalOpen(false)
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalCloseButton />
          <ModalBody pt={5} className="modal-content">
            <Stack spacing={3}>
              {compiler(content, {
                wrapper: null,
                overrides: {
                  h1: { component: Heading, props: { as: 'h1', size: 'lg' } },
                  a: { props: { target: '_blank' } },
                },
              })}
            </Stack>
          </ModalBody>
          <ModalFooter></ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}
