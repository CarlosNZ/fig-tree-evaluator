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
  modalState: { modalOpen, closeModal },
}: {
  selected: string
  content: string
  modalState: { modalOpen: boolean; closeModal: () => void }
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
          closeModal()
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
