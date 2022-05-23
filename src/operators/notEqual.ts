import { OperationInput } from '../operatorReference'
import { parse } from './logicalAnd'

const operate = ({ children }: OperationInput): boolean => children[0] != children[1]

export const notEqual = { parse, operate }
