export declare type BasicObject = {
    [key: string]: any;
};
interface QueryRowResult {
    [columns: string]: any;
}
export interface QueryResult {
    rows: QueryRowResult[];
}
export interface IConnection {
    query: (expression: {
        text: string;
        values?: any[];
        rowMode?: string;
    }) => Promise<QueryResult>;
}
export interface IGraphQLConnection {
    fetch: Function;
    endpoint: string;
    headers?: {
        [key: string]: string;
    };
}
export interface IParameters {
    objects?: BasicObject;
    pgConnection?: IConnection;
    graphQLConnection?: IGraphQLConnection;
    APIfetch?: Function;
    headers?: {
        [key: string]: string;
    };
}
export interface OperatorNode {
    operator: Operator;
    type?: OutputType;
    children?: Array<EvaluatorNode>;
    fallback?: any;
    value?: ValueNode;
}
export declare type ValueNode = string | boolean | number | BasicObject | null | undefined | any[];
export declare type OutputType = 'string' | 'number' | 'boolean' | 'array';
declare type Operator = 'AND' | 'OR' | 'CONCAT' | '=' | '!=' | '+' | '?' | 'REGEX' | 'objectProperties' | 'objectFunctions' | 'stringSubstitution' | 'GET' | 'POST' | 'API' | 'pgSQL' | 'graphQL';
export declare type EvaluatorNode = OperatorNode | ValueNode;
export declare type EvaluateExpression = (inputQuery: EvaluatorNode, params?: IParameters) => Promise<ValueNode>;
export declare type EvaluateExpressionInstance = (inputQuery: EvaluatorNode) => Promise<ValueNode>;
export declare type IsEvaluationExpression = (expressionOrValue: EvaluatorNode) => boolean;
export {};
