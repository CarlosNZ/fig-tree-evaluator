import { OperationInput } from '../operatorReference'
import { parse } from './logicalAnd'

const operate = ({ children }: OperationInput): boolean =>
  children.every((child) => child == children[0])

export const equal = { parse, operate }
