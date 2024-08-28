// Common functionality for Node components
import { useEffect, useState } from 'react'
import { OperatorProps } from './Operator'
import { NodeData } from 'json-edit-react'
import { getAliases } from './helpers'

interface Input {
  customNodeProps: OperatorProps
  parentData: object | unknown[] | null
  nodeData: NodeData
  onEdit: (value: unknown, path: (string | number)[]) => Promise<string | void>
}

export const useCommon = ({ customNodeProps, parentData, nodeData, onEdit }: Input) => {
  const { evaluateNode, topLevelAliases } = customNodeProps
  const [prevState, setPrevState] = useState(parentData)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  const expressionPath = nodeData.path.slice(0, -1)

  const handleSubmit = () => {
    setPrevState(parentData)
    setIsEditing(false)
  }

  const handleCancel = () => {
    onEdit(prevState, expressionPath)
    setIsEditing(false)
  }

  const listenForSubmit = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') handleCancel()
  }

  useEffect(() => {
    if (isEditing) {
      setPrevState(parentData)
      document.addEventListener('keydown', listenForSubmit)
    } else document.removeEventListener('keydown', listenForSubmit)
    return () => document.removeEventListener('keydown', listenForSubmit)
  }, [isEditing])

  const aliases = { ...topLevelAliases, ...getAliases(parentData) }

  const evaluate = async () => {
    setLoading(true)
    await evaluateNode({ ...parentData, ...aliases })
    setLoading(false)
  }

  return { handleCancel, handleSubmit, expressionPath, isEditing, setIsEditing, evaluate, loading }
}
