declare module 'fig-tree-evaluator/FigTreeEvaluator' {
  import { EvaluatorNode, FigTreeOptions } from 'fig-tree-evaluator/types';
  class FigTreeEvaluator {
      private options;
      private operators;
      private operatorAliases;
      private cache;
      constructor(options?: FigTreeOptions);
      private typeChecker;
      evaluate(expression: EvaluatorNode, options?: FigTreeOptions): Promise<import("fig-tree-evaluator/types").EvaluatorOutput>;
      getOptions(): FigTreeOptions;
      updateOptions(options: FigTreeOptions): void;
      getVersion: () => any;
  }
  export default FigTreeEvaluator;
  export const evaluateExpression: (expression: EvaluatorNode, options?: FigTreeOptions) => Promise<import("fig-tree-evaluator/types").EvaluatorOutput>;

}
declare module 'fig-tree-evaluator/cache' {
  class FigTreeCache {
      private store;
      private queue;
      private maxSize;
      constructor(maxSize?: number);
      useCache: (shouldUseCache: boolean, action: Function, ...args: unknown[]) => Promise<any>;
      getMax: () => number;
      setMax: (size: number) => void;
  }
  export default FigTreeCache;

}
declare module 'fig-tree-evaluator/evaluate' {
  import { FigTreeConfig, EvaluatorNode, EvaluatorOutput } from 'fig-tree-evaluator/types';
  export const evaluatorFunction: (input: EvaluatorNode, config: FigTreeConfig) => Promise<EvaluatorOutput>;

}
declare module 'fig-tree-evaluator/helpers' {
  import { OutputType, EvaluatorNode, CombinedOperatorNode, Operator, EvaluatorOutput, FigTreeOptions, OperatorNodeUnion, FigTreeConfig } from 'fig-tree-evaluator/types';
  export const parseIfJson: (input: EvaluatorNode) => any;
  export const isOperatorNode: (input: EvaluatorNode) => boolean;
  export const isFragmentNode: (input: EvaluatorNode) => boolean;
  export const getOperatorName: (operator: string, operatorAliases: {
      [key: string]: "AND" | "OR" | "EQUAL" | "NOT_EQUAL" | "PLUS" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "GREATER_THAN" | "LESS_THAN" | "CONDITIONAL" | "REGEX" | "OBJECT_PROPERTIES" | "STRING_SUBSTITUTION" | "SPLIT" | "COUNT" | "GET" | "POST" | "PG_SQL" | "GRAPHQL" | "BUILD_OBJECT" | "MATCH" | "CUSTOM_FUNCTIONS" | "PASSTHRU";
  }) => "AND" | "OR" | "EQUAL" | "NOT_EQUAL" | "PLUS" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "GREATER_THAN" | "LESS_THAN" | "CONDITIONAL" | "REGEX" | "OBJECT_PROPERTIES" | "STRING_SUBSTITUTION" | "SPLIT" | "COUNT" | "GET" | "POST" | "PG_SQL" | "GRAPHQL" | "BUILD_OBJECT" | "MATCH" | "CUSTOM_FUNCTIONS" | "PASSTHRU";
  export const truncateString: (string: string, length?: number) => string;
  export const fallbackOrError: (fallback: any, errorMessage: string, returnErrorAsString?: boolean) => any;
  export const mapPropertyAliases: (propertyAliases: {
      [key: string]: string;
  }, expression: CombinedOperatorNode) => CombinedOperatorNode;
  export const evaluateNodeAliases: (expression: OperatorNodeUnion, config: FigTreeConfig) => Promise<{
      [x: string]: EvaluatorOutput;
  }>;
  export const replaceAliasNodeValues: (value: EvaluatorOutput, { resolvedAliasNodes }: FigTreeConfig) => EvaluatorOutput;
  export const checkRequiredNodes: (requiredProps: readonly string[], expression: CombinedOperatorNode) => string | false;
  export const mergeOptions: (origOptions: FigTreeOptions, newOptions: FigTreeOptions) => FigTreeOptions;
  export const convertOutputMethods: {
      [key in OutputType]: (value: EvaluatorOutput) => EvaluatorOutput | EvaluatorOutput[];
  };
  export const errorMessage: (err: unknown) => string;
  export const isObject: (input: unknown) => boolean;
  export const evaluateObject: (input: EvaluatorNode, config: FigTreeConfig) => Promise<EvaluatorOutput>;

}
declare module 'fig-tree-evaluator/index' {
  import FigTreeEvaluator, { evaluateExpression } from 'fig-tree-evaluator/FigTreeEvaluator';
  import { Operator, GenericObject, FigTreeOptions, EvaluatorNode, EvaluatorOutput } from 'fig-tree-evaluator/types';
  export { evaluateExpression, type Operator, type GenericObject, type FigTreeOptions, type EvaluatorNode, type EvaluatorOutput, };
  export default FigTreeEvaluator;

}
declare module 'fig-tree-evaluator/operators/_operatorUtils' {
  import { GenericObject, EvaluatorNode, EvaluatorOutput, FigTreeConfig } from 'fig-tree-evaluator/types';
  export const evaluateArray: (nodes: EvaluatorNode[], params: FigTreeConfig) => Promise<EvaluatorOutput[]>;
  export const zipArraysToObject: <T>(keys: string[], values: T[]) => {
      [x: string]: T;
  };
  export const singleArrayToObject: (elements: any[]) => any;
  export const simplifyObject: (item: number | string | boolean | GenericObject) => any;
  export const extractAndSimplify: (data: GenericObject | GenericObject[], returnProperty: string | undefined, fallback?: any) => any;
  export const isFullUrl: (url: string) => boolean;
  export const joinUrlParts: (...urls: string[]) => string;
  export const axiosRequest: ({ url, params, data, headers, method, }: {
      url: string;
      params?: GenericObject | undefined;
      data?: GenericObject | undefined;
      headers?: GenericObject | undefined;
      method?: "get" | "post" | undefined;
  }) => Promise<any>;

}
declare module 'fig-tree-evaluator/operators/buildObject' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["properties"];
  export type BuildObjectNode = {
      [key in typeof requiredProperties[number]]: BuildObjectElement[];
  } & BaseOperatorNode;
  type BuildObjectElement = {
      key: EvaluatorNode;
      value: EvaluatorNode;
  };
  export const BUILD_OBJECT: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/conditional' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["condition", "valueIfTrue", "valueIfFalse"];
  export type ConditionalNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode;
  export const CONDITIONAL: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/count' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  export const COUNT: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/customFunctions' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["functionPath"];
  export type FunctionNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode & {
      args: EvaluatorNode[];
  };
  export const CUSTOM_FUNCTIONS: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/divide' {
  import { BasicExtendedNode } from 'fig-tree-evaluator/operators/logicalAnd';
  import { EvaluatorNode, OperatorObject, BaseOperatorNode } from 'fig-tree-evaluator/types';
  interface DivisionNodeWithProps extends BaseOperatorNode {
      dividend: EvaluatorNode;
      divisor: EvaluatorNode;
  }
  type DivisionOutput = 'quotient' | 'remainder';
  export type DivisionNode = BasicExtendedNode & DivisionNodeWithProps & {
      output?: DivisionOutput;
  };
  export const DIVIDE: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/equal' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  export const EQUAL: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/getRequest' {
  import { BaseOperatorNode, EvaluatorNode, FigTreeConfig, CombinedOperatorNode, GenericObject, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["url"];
  export type APINode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode & {
      parameters?: EvaluatorNode;
      returnProperty?: EvaluatorNode;
      headers?: GenericObject;
  };
  export const parseChildrenGET: (expression: CombinedOperatorNode, config: FigTreeConfig) => Promise<APINode>;
  export const GET: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/graphQL' {
  import { BaseOperatorNode, EvaluatorNode, GenericObject, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["query"];
  export type GraphQLNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode & {
      url?: EvaluatorNode;
      variables?: EvaluatorNode;
      returnNode?: EvaluatorNode;
      headers?: GenericObject;
  };
  export interface GraphQLConnection {
      endpoint: string;
      headers?: {
          [key: string]: string;
      };
  }
  export const GRAPHQL: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/greaterThan' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  import { BasicExtendedNode } from 'fig-tree-evaluator/operators/logicalAnd';
  export type ComparatorNode = BasicExtendedNode & {
      strict?: boolean;
  };
  export const GREATER_THAN: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/index' {
  export * from 'fig-tree-evaluator/operators/logicalOr';
  export { AND, type BasicExtendedNode } from 'fig-tree-evaluator/operators/logicalAnd';
  export * from 'fig-tree-evaluator/operators/equal';
  export * from 'fig-tree-evaluator/operators/notEqual';
  export * from 'fig-tree-evaluator/operators/plus';
  export * from 'fig-tree-evaluator/operators/subtract';
  export * from 'fig-tree-evaluator/operators/multiply';
  export * from 'fig-tree-evaluator/operators/divide';
  export * from 'fig-tree-evaluator/operators/greaterThan';
  export * from 'fig-tree-evaluator/operators/lessThan';
  export * from 'fig-tree-evaluator/operators/conditional';
  export * from 'fig-tree-evaluator/operators/regex';
  export * from 'fig-tree-evaluator/operators/objectProperties';
  export * from 'fig-tree-evaluator/operators/stringSubstitution';
  export * from 'fig-tree-evaluator/operators/count';
  export * from 'fig-tree-evaluator/operators/split';
  export * from 'fig-tree-evaluator/operators/pgSQL';
  export * from 'fig-tree-evaluator/operators/graphQL';
  export { GET, type APINode } from 'fig-tree-evaluator/operators/getRequest';
  export * from 'fig-tree-evaluator/operators/postRequest';
  export * from 'fig-tree-evaluator/operators/buildObject';
  export * from 'fig-tree-evaluator/operators/match';
  export * from 'fig-tree-evaluator/operators/customFunctions';
  export * from 'fig-tree-evaluator/operators/passThru';

}
declare module 'fig-tree-evaluator/operators/lessThan' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  export const LESS_THAN: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/logicalAnd' {
  import { EvaluatorNode, BaseOperatorNode, CombinedOperatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["values"];
  export type BasicExtendedNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode[];
  } & BaseOperatorNode;
  export const parseChildren: (expression: CombinedOperatorNode) => BasicExtendedNode;
  export const AND: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/logicalOr' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  export const OR: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/match' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["matchExpression"];
  export type MatchNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode;
  export const MATCH: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/multiply' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  export const MULTIPLY: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/notEqual' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  export const NOT_EQUAL: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/objectProperties' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: string[];
  export type ObjPropNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode & {
      additionalData: object;
  };
  export const OBJECT_PROPERTIES: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/passThru' {
  import { OperatorObject, EvaluatorNode, BaseOperatorNode } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["value"];
  export type PassThruNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode[];
  } & BaseOperatorNode;
  export const PASSTHRU: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/pgSQL' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["query"];
  export type PGNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode & {
      values?: EvaluatorNode[];
      type?: 'string';
  };
  export interface PGConnection {
      query: (expression: {
          text: string;
          values?: any[];
          rowMode?: string;
      }) => Promise<QueryResult>;
  }
  interface QueryRowResult {
      [columns: string]: any;
  }
  export interface QueryResult {
      rows: QueryRowResult[];
      error?: string;
  }
  export const PG_SQL: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/plus' {
  import { OperatorObject, EvaluatorNode } from 'fig-tree-evaluator/types';
  import { BasicExtendedNode } from 'fig-tree-evaluator/operators/logicalAnd';
  const requiredProperties: readonly ["values"];
  export type AdditionNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BasicExtendedNode & {
      type?: 'string' | 'array';
  };
  export const PLUS: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/postRequest' {
  import { OperatorObject } from 'fig-tree-evaluator/types';
  export const POST: OperatorObject;

}
declare module 'fig-tree-evaluator/operators/regex' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["testString", "pattern"];
  export type RegexNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode;
  export const REGEX: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/split' {
  import { OperatorObject, EvaluatorNode, BaseOperatorNode } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["value"];
  export type SplitNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode & {
      delimiter?: EvaluatorNode;
      trimWhiteSpace: EvaluatorNode;
      excludeTrailing: EvaluatorNode;
  };
  export const SPLIT: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/stringSubstitution' {
  import { BaseOperatorNode, EvaluatorNode, OperatorObject } from 'fig-tree-evaluator/types';
  const requiredProperties: readonly ["string", "substitutions"];
  export type StringSubNode = {
      [key in typeof requiredProperties[number]]: EvaluatorNode;
  } & BaseOperatorNode;
  export const STRING_SUBSTITUTION: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/operators/subtract' {
  import { BasicExtendedNode } from 'fig-tree-evaluator/operators/logicalAnd';
  import { EvaluatorNode, OperatorObject, BaseOperatorNode } from 'fig-tree-evaluator/types';
  interface SubtractionNodeWithProps extends BaseOperatorNode {
      subtract: EvaluatorNode;
      from: EvaluatorNode;
  }
  export type SubtractionNode = BasicExtendedNode & SubtractionNodeWithProps;
  export const SUBTRACT: OperatorObject;
  export {};

}
declare module 'fig-tree-evaluator/typeCheck' {
  export type ExpectedType = 'string' | 'boolean' | 'number' | 'array' | 'undefined' | 'null' | 'object';
  export type TypeCheckInput = {
      value: unknown;
      name?: string;
      not?: boolean;
      expectedType: ExpectedType | ExpectedType[];
  };
  export const typeCheck: (...args: TypeCheckInput[]) => true | string;

}
declare module 'fig-tree-evaluator/types' {
  import FigTreeCache from 'fig-tree-evaluator/cache';
  import { BasicExtendedNode, SubtractionNode, DivisionNode, ComparatorNode, ConditionalNode, RegexNode, StringSubNode, SplitNode, ObjPropNode, APINode, PGNode, GraphQLNode, BuildObjectNode, MatchNode, FunctionNode, PassThruNode, PGConnection, GraphQLConnection } from 'fig-tree-evaluator/operators/index';
  import { TypeCheckInput } from 'fig-tree-evaluator/typeCheck';
  export const Operators: readonly ["AND", "OR", "EQUAL", "NOT_EQUAL", "PLUS", "SUBTRACT", "MULTIPLY", "DIVIDE", "GREATER_THAN", "LESS_THAN", "CONDITIONAL", "REGEX", "OBJECT_PROPERTIES", "STRING_SUBSTITUTION", "SPLIT", "COUNT", "GET", "POST", "PG_SQL", "GRAPHQL", "BUILD_OBJECT", "MATCH", "CUSTOM_FUNCTIONS", "PASSTHRU"];
  export type Operator = typeof Operators[number];
  export type GenericObject = {
      [key: string]: any;
  };
  export interface FigTreeOptions {
      data?: GenericObject;
      objects?: GenericObject;
      functions?: {
          [key: string]: Function;
      };
      fragments?: {
          [key: string]: EvaluatorNode;
      };
      pgConnection?: PGConnection;
      graphQLConnection?: GraphQLConnection;
      baseEndpoint?: string;
      headers?: {
          [key: string]: string;
      };
      returnErrorAsString?: boolean;
      nullEqualsUndefined?: boolean;
      allowJSONStringInput?: boolean;
      skipRuntimeTypeCheck?: boolean;
      evaluateFullObject?: boolean;
      useCache?: boolean;
      maxCacheSize?: number;
      supportDeprecatedValueNodes?: boolean;
  }
  export interface FigTreeConfig {
      options: FigTreeOptions;
      operators: OperatorReference;
      operatorAliases: {
          [key: string]: Operator;
      };
      typeChecker: (...input: TypeCheckInput[]) => void;
      resolvedAliasNodes: {
          [key: string]: EvaluatorOutput;
      };
      cache: FigTreeCache;
  }
  export type OutputType = 'string' | 'number' | 'boolean' | 'bool' | 'array';
  export interface BaseOperatorNode {
      operator: Operator;
      outputType?: OutputType;
      children?: Array<EvaluatorNode>;
      fallback?: any;
      useCache?: boolean;
      [key: string]: EvaluatorNode;
  }
  export interface FragmentNode {
      fragment: string;
      parameters?: {
          [key: string]: EvaluatorNode;
      };
      [key: string]: EvaluatorNode;
  }
  export type CombinedOperatorNode = BaseOperatorNode & BasicExtendedNode & SubtractionNode & DivisionNode & ComparatorNode & ConditionalNode & RegexNode & StringSubNode & SplitNode & ObjPropNode & APINode & PGNode & GraphQLNode & BuildObjectNode & MatchNode & FunctionNode & PassThruNode;
  export type OperatorNodeUnion = BasicExtendedNode | SubtractionNode | DivisionNode | ComparatorNode | ConditionalNode | RegexNode | StringSubNode | SplitNode | ObjPropNode | PGNode | GraphQLNode | APINode | BuildObjectNode | MatchNode | FunctionNode | PassThruNode;
  export type EvaluatorOutput = string | boolean | number | GenericObject | null | undefined | any[];
  export type EvaluatorNode = CombinedOperatorNode | FragmentNode | EvaluatorOutput;
  export type OperatorObject = {
      requiredProperties: readonly string[];
      operatorAliases: string[];
      propertyAliases: {
          [key: string]: string;
      };
      evaluate: (expression: CombinedOperatorNode, config: FigTreeConfig) => Promise<EvaluatorOutput>;
      parseChildren: (expression: CombinedOperatorNode, config: FigTreeConfig) => OperatorNodeUnion | Promise<OperatorNodeUnion>;
  };
  export type OperatorReference = {
      [key in Operator]: OperatorObject;
  };

}
declare module 'fig-tree-evaluator' {
  import main = require('fig-tree-evaluator/index');
  export = main;
}