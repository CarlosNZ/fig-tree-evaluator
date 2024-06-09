import { Text, Flex, Button, HStack, Box, useToast } from '@chakra-ui/react'
import { CheckCircleIcon, CloseIcon } from '@chakra-ui/icons'
import { truncate } from 'json-edit-react'

const RESULT_TEXT_LIMIT = 500

interface ResultProps {
  title?: string
  value: unknown
  close: () => void
}

export const ResultToast: React.FC<ResultProps> = ({ title, value, close }) => {
  const toast = useToast()
  const text = value instanceof Object ? JSON.stringify(value, null, 2) : String(value)
  const isTruncated = text.length >= RESULT_TEXT_LIMIT
  return (
    <Flex
      key={String(value)}
      p={4}
      bgColor="green.600"
      color="white"
      rounded="md"
      boxShadow="lg"
      gap={4}
      position="relative"
    >
      <CloseIcon
        position="absolute"
        right="0.5em"
        top="0.5em"
        onClick={close}
        boxSize={7}
        p={2}
        rounded="md"
        _hover={{ bgColor: 'rgb(255, 255, 255, 0.1)' }}
      />
      <Flex direction="column" w="100%" justifyContent="flex-start" gap={4}>
        <HStack gap={4} alignItems="flex-start">
          <CheckCircleIcon boxSize={5} mt={2} />
          <Box maxH="70vh" overflow="hidden">
            <Text color="white">
              <strong>{String(title)}</strong>
            </Text>
            <Text
              color="white"
              whiteSpace="pre-wrap"
              fontSize={text.length < 30 ? '120%' : undefined}
            >
              {truncate(text, RESULT_TEXT_LIMIT)}
            </Text>
          </Box>
        </HStack>
        {isTruncated && (
          <Text color="white" fontSize="small" textAlign="center">
            <em>Result truncated. Copy to clipboard to capture full output.</em>
          </Text>
        )}
        <Flex w="100%" justifyContent="center">
          <Button
            size="xs"
            // mt={4}
            colorScheme="whiteAlpha"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(text)
              toast({
                description: 'Result copied to clipboard',
                position: 'bottom',
                status: 'info',
                duration: 2000,
                isClosable: true,
              })
            }}
          >
            Copy to clipboard
          </Button>
        </Flex>
      </Flex>
    </Flex>
  )
}
