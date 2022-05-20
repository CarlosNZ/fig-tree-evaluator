import { EvaluateExpressionInstance, ValueNode, EvaluatorNode } from '../types';
export declare type BuildObjectQuery = {
    operator: 'buildObject';
    properties: {
        key: EvaluatorNode;
        value: EvaluatorNode;
    }[];
};
declare type BuildObject = (buildObjectQuery: BuildObjectQuery, evaluateExpressionInstance: EvaluateExpressionInstance) => Promise<ValueNode>;
declare const buildObject: BuildObject;
export default buildObject;
