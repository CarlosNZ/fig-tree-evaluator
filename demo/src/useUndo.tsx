import useUndoHook from 'use-undo'
import { dequal } from 'dequal'
import { Button, HStack, VStack, Spacer } from '@chakra-ui/react'
import { BiReset } from 'react-icons/bi'
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons'
import { useState } from 'react'

export const useUndo = (initialData: object) => {
  const [resetPoint, setResetPoint] = useState(initialData)
  const [{ present: data }, { set: setData, reset, undo, redo, canUndo, canRedo }] =
    useUndoHook(initialData)

  const handleChange = (newData: object) => {
    if (dequal(newData, data)) return
    setData(newData)
  }

  const externalReset = (newData: object) => {
    reset(newData)
    setResetPoint(newData)
  }

  const UndoRedo = (
    <VStack w="80%" maxW={500} align="flex-end" gap={4}>
      <HStack w="100%" justify="space-between" mt={4}>
        <Button
          colorScheme="green"
          leftIcon={<ArrowBackIcon />}
          onClick={() => undo()}
          isDisabled={!canUndo}
        >
          Undo
        </Button>
        <Spacer />
        <Button
          colorScheme="green"
          rightIcon={<ArrowForwardIcon />}
          onClick={() => redo()}
          isDisabled={!canRedo}
        >
          Redo
        </Button>
      </HStack>
      <HStack justify="flex-end" w="100%">
        <Button
          color="accent"
          borderColor="accent"
          leftIcon={<BiReset />}
          variant="outline"
          onClick={() => reset(resetPoint)}
          visibility={canUndo ? 'visible' : 'hidden'}
        >
          Reset
        </Button>
      </HStack>
    </VStack>
  )

  return { data, setData: handleChange, reset: externalReset, setResetPoint, UndoRedo }
}
