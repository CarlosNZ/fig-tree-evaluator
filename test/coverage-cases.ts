/**
 * The case corpus for the precise `fallbackCoverage` of #217
 * (docs-dev/v3-specs/v3-fallback-coverage.md). Each case is an expression
 * and the findings the analysis should report for it: the failures nothing
 * catches (`uncovered`) and the ones a fallback catches (`covered`).
 *
 * test/coverage-cases.test.ts checks the corpus against the engine:
 *
 * - a finding's `witness` is data under which `evaluate()` really fails
 *   that way, so a listed finding is not a false positive;
 * - every failure the engine shows over a spread of data was predicted, so
 *   nothing that can fail is missing.
 *
 * It then checks the analysis gives each case exactly its findings, and
 * against the engine, that it is sound.
 *
 * A finding with no witness is either certain (`will`, any data reaches
 * it) or a false positive the design accepts, which its case's `note`
 * explains. `open` records a question the case raises; its expectation is
 * the recommended answer.
 */
import type { FigTreeErrorCode, FragmentDefinition } from '../src'

export type NodePath = (string | number)[]

export interface Finding {
  /** The node where the failure starts, or a fragment call's site */
  at: NodePath
  code: FigTreeErrorCode
  parameter?: string
  /** Certain whenever the node is reached, rather than possible */
  will?: true
  /** Covered findings: the node whose fallback catches it */
  by?: NodePath
  /** Where `by` is a node inside a fragment body: its place there */
  byFragmentPath?: NodePath
  /** A failure inside a fragment body: the fragment, and where in it */
  fragment?: string
  fragmentPath?: NodePath
  /** Evaluation data under which the engine fails this way */
  witness?: Record<string, unknown>
  /** For I/O: how the client behaves in the witness run */
  client?: 'fails' | 'slow'
  /**
   * An external operator's one `operator-failure` finding, which stands for
   * whatever code its own code throws: an I/O operator's request and
   * checks, an undeclared host's body
   */
  external?: true
}

export interface CoverageCase {
  name: string
  expression: unknown
  /** An instance from test/coverage-cases.test.ts; default `new FigTree()` */
  instance?: 'strict' | 'fragments' | 'lowerDefault' | 'io' | 'ioBase' | 'host'
  /** A timeout on the instance, in ms, which the case is analysed under */
  timeout?: number
  /** `fallbackCoverage`'s own options */
  options?: { strictNumbers?: true }
  uncovered?: Finding[]
  covered?: Finding[]
  note?: string
  open?: string
}

const twoNumbers = { a: { type: 'number' }, b: { type: 'number' } } as const
/** The fragments the `fragments` instance registers. */
export const fragments: Record<string, FragmentDefinition> = {
  double: {
    expression: { $multiply: ['$params.n', 2] },
    parameters: { n: { type: 'number' } },
  },
  maybeDouble: {
    expression: { $multiply: ['$params.n', 2] },
    parameters: { n: { type: ['number', 'null'] } },
  },
  ratio: { expression: { $divide: ['$params.a', '$params.b'] }, parameters: twoNumbers },
  safeRatio: {
    expression: { $divide: ['$params.a', '$params.b'], fallback: 0 },
    parameters: twoNumbers,
  },
  shout: { expression: { $upper: '$params.s' }, parameters: { s: { type: 'string' } } },
  maybeFail: {
    expression: { $if: ['$params.c', { $divide: [1, 0] }, 1] },
    parameters: { c: { type: 'any' } },
  },
}

export const sections: Record<string, CoverageCase[]> = {
  'Constants and folding': [
    { name: 'a constant', expression: 42 },
    { name: 'an operator with constant arguments', expression: { $plus: [1, 2] } },
    {
      name: 'folding carries upward',
      expression: { $plus: [{ $multiply: [2, 3] }, 1] },
    },
    {
      name: 'a constant division by zero is certain',
      expression: { $divide: [1, 0] },
      uncovered: [{ at: [], code: 'non-finite-result', will: true }],
    },
    {
      name: 'a certain failure under a constant parent',
      expression: { $plus: [1, { $divide: [1, 0] }] },
      uncovered: [{ at: ['$plus', 1], code: 'non-finite-result', will: true }],
    },
    {
      name: 'a certain failure, caught',
      expression: { $divide: [1, 0], fallback: 0 },
      covered: [{ at: [], code: 'non-finite-result', will: true, by: [] }],
    },
    {
      name: 'folding exposes a type failure',
      expression: { $plus: [1, { $upper: 'a' }] },
      uncovered: [{ at: [], code: 'type-check', will: true }],
    },
    {
      name: 'folding produces an empty aggregate',
      expression: { $min: { $filter: { input: [1, 2], each: false } } },
      uncovered: [{ at: [], code: 'empty-aggregate', will: true }],
    },
    {
      name: 'a folded value narrows a sibling',
      expression: { $divide: ['$data.n', { $plus: [1, 1] }] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'value', witness: { n: 'a' } }],
    },
    {
      name: 'get with a constant from folds',
      expression: { $get: { path: 'a', from: { a: 1 } } },
    },
    {
      name: 'get without from reads the data, so it never folds',
      expression: { $get: 'a' },
    },
  ],

  References: [
    { name: 'a data reference', expression: '$data.x' },
    {
      name: 'a data reference under strictDataPaths',
      expression: '$data.x',
      instance: 'strict',
      uncovered: [{ at: [], code: 'missing-data-path', witness: {} }],
    },
    { name: 'bare $data under strictDataPaths', expression: '$data', instance: 'strict' },
    {
      name: 'untyped data into a typed parameter',
      expression: { $lower: '$data.s' },
      uncovered: [{ at: [], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    { name: 'untyped data into an any parameter', expression: { $not: '$data.x' } },
    { name: 'equal takes anything', expression: { $equal: ['$data.a', '$data.b'] } },
    { name: 'if takes anything', expression: { $if: ['$data.c', '$data.a', '$data.b'] } },
    {
      name: 'join renders anything in a literal array',
      expression: { $join: ['$data.a', '$data.b'] },
    },
    {
      name: 'join given a whole computed array',
      expression: { $join: '$data.list' },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { list: 'x' } }],
    },
    {
      name: 'get from computed data, with a constant path',
      expression: { $get: { path: 'x', from: '$data.o' } },
    },
    {
      name: 'get with a computed path',
      expression: { $get: '$data.k' },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'path', witness: { k: 1 } },
        { at: [], code: 'operator-failure', parameter: 'path', witness: { k: 'a[' } },
      ],
    },
  ],

  'Types between nodes': [
    {
      name: 'an output type inside the parameter type',
      expression: { $plus: [{ $length: '$data.list', fallback: 0 }, 1] },
      covered: [
        {
          at: ['$plus', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$plus', 0],
          witness: { list: 1 },
        },
      ],
    },
    {
      name: 'plus narrowed to its operands’ kind',
      expression: { $multiply: [{ $plus: [{ $length: '$data.list', fallback: 0 }, 1] }, 2] },
      covered: [
        {
          at: ['$multiply', 0, '$plus', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$multiply', 0, '$plus', 0],
          witness: { list: 1 },
        },
      ],
    },
    {
      name: 'floor returns an integer',
      expression: {
        $round: [3.14159, { $floor: { $divide: [{ $length: '$data.s', fallback: 4 }, 2] } }],
      },
      uncovered: [
        {
          at: [],
          code: 'non-finite-result',
          parameter: 'decimals',
          witness: { s: 'a'.repeat(618) },
        },
      ],
      covered: [
        {
          at: ['$round', 1, '$floor', '$divide', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$round', 1, '$floor', '$divide', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a number where an integer is required',
      expression: { $round: [3.14159, { $divide: [{ $length: '$data.s', fallback: 4 }, 2] }] },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'decimals', witness: { s: 'abc' } },
        {
          at: [],
          code: 'non-finite-result',
          parameter: 'decimals',
          witness: { s: 'a'.repeat(618) },
        },
      ],
      covered: [
        {
          at: ['$round', 1, '$divide', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$round', 1, '$divide', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'join never returns null',
      expression: { $upper: { $join: ['$data.a', '$data.b'] } },
    },
    {
      name: 'buildString always returns a string',
      expression: { $upper: { $buildString: ['Hi %1', '$data.name'] } },
    },
    {
      name: 'convert narrowed by to',
      expression: { $plus: [{ $convert: ['$data.n', 'number'], fallback: 0 }, 1] },
      covered: [
        { at: ['$plus', 0], code: 'operator-failure', by: ['$plus', 0], witness: { n: 'abc' } },
        {
          at: ['$plus', 0],
          code: 'non-finite-result',
          by: ['$plus', 0],
          witness: { n: 'Infinity' },
        },
      ],
    },
    {
      name: 'convert to boolean never fails',
      expression: { $not: { $convert: ['$data.x', 'boolean'] } },
    },
    {
      name: 'convert to array never fails',
      expression: { $length: { $convert: ['$data.x', 'array'] } },
    },
    {
      name: 'convert to string fails on a composite',
      expression: { $upper: { $convert: ['$data.x', 'string'] } },
      uncovered: [{ at: ['$upper'], code: 'operator-failure', witness: { x: [] } }],
    },
    {
      name: 'regex narrowed by mode',
      expression: {
        $upper: {
          $regex: {
            value: { $lower: '$data.s', fallback: '' },
            pattern: 'a+',
            mode: 'extract',
            noMatchDefault: '',
          },
        },
      },
      covered: [
        {
          at: ['$upper', '$regex', 'value'],
          code: 'type-check',
          parameter: 'value',
          by: ['$upper', '$regex', 'value'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'regex in test mode feeding a string parameter',
      expression: { $upper: { $regex: [{ $lower: '$data.s', fallback: '' }, 'a+'] } },
      uncovered: [{ at: [], code: 'type-check', parameter: 'value', witness: { s: 'x' } }],
      covered: [
        {
          at: ['$upper', '$regex', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$upper', '$regex', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a fallback widens the output type',
      expression: { $multiply: [{ $length: '$data.list', fallback: 'none' }, 2] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { list: 5 } }],
      covered: [
        {
          at: ['$multiply', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$multiply', 0],
          witness: { list: 5 },
        },
      ],
    },
    {
      name: 'if returns the union of its branches',
      expression: { $plus: [{ $if: ['$data.c', 1, 2] }, 1] },
    },
    {
      name: 'if with no else can return null',
      expression: { $map: { input: { $if: ['$data.c', [1, 2]] }, each: '$element' } },
      uncovered: [{ at: [], code: 'type-check', parameter: 'input', witness: { c: false } }],
    },
    {
      name: 'match returns the union of its branches',
      expression: {
        $plus: [
          {
            $match: {
              value: { $lower: '$data.k', fallback: 'a' },
              branches: { a: 1, b: 2 },
              default: 0,
            },
          },
          1,
        ],
      },
      covered: [
        {
          at: ['$plus', 0, '$match', 'value'],
          code: 'type-check',
          parameter: 'value',
          by: ['$plus', 0, '$match', 'value'],
          witness: { k: 1 },
        },
      ],
    },
    {
      name: 'firstOf with an untyped candidate',
      expression: { $plus: [{ $firstOf: ['$data.a', 0] }, 1] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { a: 'x' } }],
    },
    {
      name: 'firstOf drops the nulls of all but the last candidate',
      expression: { $plus: [{ $firstOf: [{ $length: '$data.a', fallback: null }, 0] }, 1] },
      covered: [
        {
          at: ['$plus', 0, '$firstOf', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$plus', 0, '$firstOf', 0],
          witness: { a: 1 },
        },
      ],
    },
    {
      name: 'max passes its candidates’ kind through',
      expression: { $upper: { $max: [{ $lower: '$data.a', fallback: 'a' }, 'b'] } },
      covered: [
        {
          at: ['$upper', '$max', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$upper', '$max', 0],
          witness: { a: 1 },
        },
      ],
    },
  ],

  Null: [
    {
      name: 'a propagated null meets a parameter that rejects it',
      expression: {
        $map: { input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] }, each: '$element' },
      },
      uncovered: [{ at: [], code: 'type-check', parameter: 'input', witness: { s: null } }],
      covered: [
        {
          at: ['$map', 'input', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$map', 'input', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'nullInputDefault absorbs it',
      expression: {
        $map: {
          input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
          nullInputDefault: [],
          each: '$element',
        },
      },
      covered: [
        {
          at: ['$map', 'input', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$map', 'input', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a null operand propagates through plus',
      expression: { $plus: [{ $lower: '$data.s', fallback: '' }, 'x'] },
      covered: [
        {
          at: ['$plus', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$plus', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a null key in buildObject',
      expression: { $buildObject: [{ key: { $lower: '$data.k', fallback: 'k' }, value: 1 }] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'entries', witness: { k: null } }],
      covered: [
        {
          at: ['$buildObject', 0, 'key'],
          code: 'type-check',
          parameter: 'value',
          by: ['$buildObject', 0, 'key'],
          witness: { k: 1 },
        },
      ],
    },
    {
      name: 'a null at an optional parameter takes the default',
      expression: { $split: ['a,b', { $lower: '$data.d', fallback: ',' }] },
      covered: [
        {
          at: ['$split', 1],
          code: 'type-check',
          parameter: 'value',
          by: ['$split', 1],
          witness: { d: 1 },
        },
      ],
    },
    {
      name: 'equal takes null as a value',
      expression: { $not: { $equal: [{ $lower: '$data.s', fallback: '' }, null] } },
      covered: [
        {
          at: ['$not', '$equal', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$not', '$equal', 0],
          witness: { s: 1 },
        },
      ],
    },
  ],

  'Operator conditions with some inputs known': [
    {
      name: 'a known divisor',
      expression: { $divide: [{ $length: '$data.list', fallback: 0 }, 2] },
      covered: [
        {
          at: ['$divide', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$divide', 0],
          witness: { list: 1 },
        },
      ],
    },
    {
      name: 'a computed divisor may be 0',
      expression: { $divide: [10, { $length: '$data.list', fallback: 1 }] },
      uncovered: [{ at: [], code: 'non-finite-result', parameter: 'by', witness: { list: [] } }],
      covered: [
        {
          at: ['$divide', 1],
          code: 'type-check',
          parameter: 'value',
          by: ['$divide', 1],
          witness: { list: 1 },
        },
      ],
    },
    {
      name: 'a known modulus',
      expression: { $modulo: [{ $length: '$data.s', fallback: 0 }, 3] },
      covered: [
        {
          at: ['$modulo', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$modulo', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a computed modulus may be 0',
      expression: { $modulo: [10, { $length: '$data.s', fallback: 1 }] },
      uncovered: [{ at: [], code: 'non-finite-result', parameter: 'mod', witness: { s: '' } }],
      covered: [
        {
          at: ['$modulo', 1],
          code: 'type-check',
          parameter: 'value',
          by: ['$modulo', 1],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a computed exponent may overflow',
      expression: { $power: [2, { $length: '$data.s', fallback: 0 }] },
      uncovered: [
        {
          at: [],
          code: 'non-finite-result',
          parameter: 'exponent',
          witness: { s: 'x'.repeat(1100) },
        },
      ],
      covered: [
        {
          at: ['$power', 1],
          code: 'type-check',
          parameter: 'value',
          by: ['$power', 1],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a computed base may be 0 under a negative exponent',
      expression: { $power: [{ $length: '$data.s', fallback: 0 }, -1] },
      uncovered: [{ at: [], code: 'non-finite-result', parameter: 'base', witness: { s: '' } }],
      covered: [
        {
          at: ['$power', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$power', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a computed base under a small known exponent',
      expression: { $power: [{ $length: '$data.s', fallback: 1 }, 2] },
      covered: [
        {
          at: ['$power', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$power', 0],
          witness: { s: 1 },
        },
      ],
      open: 'Is power’s overflow reachable whatever the exponent, or only when the exponent is unknown or large? With exponent 2 the base must pass 1e154. Expected: only an unknown or large exponent',
    },
    {
      name: 'a negative base under a fractional exponent, folded',
      expression: { $power: [-8, { $divide: [1, 3] }] },
      uncovered: [{ at: [], code: 'non-finite-result', will: true }],
    },
    {
      name: 'min of a computed array',
      expression: { $min: '$data.list' },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'values', witness: { list: 'x' } },
        { at: [], code: 'empty-aggregate', parameter: 'values', witness: { list: [] } },
      ],
    },
    {
      name: 'min of a literal array is never empty',
      expression: { $min: ['$data.a', '$data.b'] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { a: 1, b: 'x' } }],
    },
    {
      name: 'plus of a computed array',
      expression: { $plus: '$data.list' },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'values', witness: { list: 'x' } },
        { at: [], code: 'empty-aggregate', parameter: 'values', witness: { list: [] } },
      ],
    },
    {
      name: 'expect gives plus an identity, so it is never empty',
      expression: { $plus: { values: '$data.list', expect: 'number' } },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { list: ['a'] } }],
    },
    {
      name: 'expect disagrees with the operands’ kind',
      expression: {
        $plus: { values: [{ $length: '$data.a', fallback: 0 }, 1], expect: 'string' },
      },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { a: [] } }],
      covered: [
        {
          at: ['$plus', 'values', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$plus', 'values', 0],
          witness: { a: 1 },
        },
      ],
      note: 'Not certain: a null operand propagates before the body sees the mismatch',
    },
    {
      name: 'a condition known to hold, with inputs not all known',
      expression: { $convert: [{ $buildObject: [{ key: 'a', value: '$data.x' }] }, 'string'] },
      uncovered: [{ at: [], code: 'operator-failure', will: true }],
      note: 'Certain from a declared condition rather than from evaluation: buildObject always returns an object',
    },
    {
      name: 'match with a computed value and no default',
      expression: { $match: { value: '$data.k', branches: { a: 1, b: 2 } } },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'value', witness: { k: [] } },
        { at: [], code: 'operator-failure', witness: { k: 'c' } },
      ],
    },
    {
      name: 'match with a default never misses',
      expression: { $match: { value: '$data.k', branches: { a: 1, b: 2 }, default: 0 } },
      uncovered: [{ at: [], code: 'type-check', parameter: 'value', witness: { k: [] } }],
    },
    {
      name: 'match with a typed value can still miss',
      expression: {
        $match: { value: { $lower: '$data.k', fallback: 'a' }, branches: { a: 1, b: 2 } },
      },
      uncovered: [{ at: [], code: 'operator-failure', witness: { k: 'C' } }],
      covered: [
        {
          at: ['$match', 'value'],
          code: 'type-check',
          parameter: 'value',
          by: ['$match', 'value'],
          witness: { k: 1 },
        },
      ],
    },
    {
      name: 'match with a known value selects its branch',
      expression: { $match: { value: 'a', branches: { a: '$data.x', b: 2 } } },
    },
    {
      name: 'match fed a choice of known keys',
      expression: { $match: { value: { $if: ['$data.c', 'a', 'b'] }, branches: { a: 1, b: 2 } } },
      note: 'The value is one of a few known values, so match runs once with each, and both find a branch',
    },
    {
      name: 'regex with untyped data',
      expression: { $regex: ['$data.s', 'a+'] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    {
      name: 'regex with a computed pattern',
      expression: { $regex: [{ $lower: '$data.s', fallback: '' }, '$data.p'] },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'pattern', witness: { s: 'a', p: 1 } },
        { at: [], code: 'operator-failure', parameter: 'pattern', witness: { s: 'a', p: 'a[' } },
      ],
      covered: [
        {
          at: ['$regex', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$regex', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a literal pattern with computed flags',
      expression: {
        $regex: { value: 'abc', pattern: '\\-', flags: { $lower: '$data.f', fallback: '' } },
      },
      uncovered: [{ at: [], code: 'operator-failure', parameter: 'flags', witness: { f: 'u' } }],
      covered: [
        {
          at: ['$regex', 'flags'],
          code: 'type-check',
          parameter: 'value',
          by: ['$regex', 'flags'],
          witness: { f: 1 },
        },
      ],
    },
    {
      name: 'buildObject with a computed key',
      expression: { $buildObject: [{ key: '$data.k', value: 1 }] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'entries', witness: { k: [] } }],
    },
  ],

  'Value ranges': [
    {
      name: 'a length plus 1 is never 0',
      expression: { $divide: [10, { $plus: [{ $length: '$data.list', fallback: 0 }, 1] }] },
      covered: [
        {
          at: ['$divide', 1, '$plus', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$divide', 1, '$plus', 0],
          witness: { list: 1 },
        },
      ],
    },
    {
      name: 'a base that cannot be negative',
      expression: { $power: [{ $length: '$data.s', fallback: 1 }, 0.5] },
      covered: [
        {
          at: ['$power', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$power', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'split on a delimiter never returns an empty array',
      expression: { $min: { $split: [{ $lower: '$data.s', fallback: '' }, ','] } },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { s: null } }],
      covered: [
        {
          at: ['$min', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$min', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'split on a delimiter from the data may return an empty array',
      expression: { $min: { $split: [{ $lower: '$data.s', fallback: '' }, '$data.d'] } },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'values', witness: { s: null } },
        { at: [], code: 'empty-aggregate', parameter: 'values', witness: { s: '', d: '' } },
        { at: ['$min'], code: 'type-check', parameter: 'delimiter', witness: { s: 'a', d: 1 } },
      ],
      covered: [
        {
          at: ['$min', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$min', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'the greater of a length and 1 is never 0',
      expression: { $divide: [10, { $max: [{ $length: '$data.list', fallback: 0 }, 1] }] },
      covered: [
        {
          at: ['$divide', 1, '$max', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$divide', 1, '$max', 0],
          witness: { list: 1 },
        },
      ],
    },
    {
      name: 'a length less 1 may be 0',
      expression: { $divide: [10, { $subtract: [{ $length: '$data.s', fallback: 0 }, 1] }] },
      uncovered: [{ at: [], code: 'non-finite-result', parameter: 'by', witness: { s: 'a' } }],
      covered: [
        {
          at: ['$divide', 1, '$subtract', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$divide', 1, '$subtract', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'an absolute value is never negative',
      expression: {
        $power: [{ $abs: { $subtract: [{ $length: '$data.s', fallback: 0 }, 5] } }, 0.5],
      },
      covered: [
        {
          at: ['$power', 0, '$abs', '$subtract', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$power', 0, '$abs', '$subtract', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: '$index plus 1 is never 0',
      expression: {
        $map: { input: '$data.list', each: { $divide: [1, { $plus: ['$index', 1] }] } },
      },
      uncovered: [{ at: [], code: 'type-check', parameter: 'input', witness: { list: 1 } }],
    },
  ],

  'Where failures surface, and fallbacks': [
    {
      name: 'a failure is reported where it starts, not on its ancestors',
      expression: { $upper: { $trim: { $lower: '$data.s' } } },
      uncovered: [
        { at: ['$upper', '$trim'], code: 'type-check', parameter: 'value', witness: { s: 1 } },
      ],
    },
    {
      name: 'a fallback anywhere above covers it',
      expression: { $upper: { $trim: { $lower: '$data.s' } }, fallback: '' },
      covered: [
        {
          at: ['$upper', '$trim'],
          code: 'type-check',
          parameter: 'value',
          by: [],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'the nearest fallback is the one that covers',
      expression: { $upper: { $trim: { $lower: '$data.s' }, fallback: 'x' }, fallback: '' },
      covered: [
        {
          at: ['$upper', '$trim'],
          code: 'type-check',
          parameter: 'value',
          by: ['$upper'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a fallback that can itself throw',
      expression: { $lower: '$data.s', fallback: { $upper: '$data.t' } },
      uncovered: [
        { at: ['fallback'], code: 'type-check', parameter: 'value', witness: { s: 1, t: 1 } },
      ],
      covered: [
        {
          at: [],
          code: 'type-check',
          parameter: 'value',
          by: [],
          witness: { s: 1, t: 'x' },
        },
      ],
    },
    {
      name: 'a fallback with a fallback of its own',
      expression: { $lower: '$data.s', fallback: { $upper: '$data.t', fallback: '' } },
      covered: [
        { at: [], code: 'type-check', parameter: 'value', by: [], witness: { s: 1, t: 'x' } },
        {
          at: ['fallback'],
          code: 'type-check',
          parameter: 'value',
          by: ['fallback'],
          witness: { s: 1, t: 1 },
        },
      ],
    },
    {
      name: 'several ways one node can fail',
      expression: { $divide: ['$data.a', '$data.b'] },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'value', witness: { a: 'x', b: 1 } },
        { at: [], code: 'type-check', parameter: 'by', witness: { a: 1, b: 'x' } },
        { at: [], code: 'non-finite-result', parameter: 'by', witness: { a: 1, b: 0 } },
      ],
    },
    {
      name: 'an operatorDefaults fallback covers',
      expression: { $lower: '$data.s' },
      instance: 'lowerDefault',
      covered: [{ at: [], code: 'type-check', parameter: 'value', by: [], witness: { s: 1 } }],
    },
    {
      name: 'an inner fallback does not cover the node above it',
      expression: { $plus: [{ $lower: '$data.s', fallback: '' }, '$data.t'] },
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: { s: 'a', t: 1 } }],
      covered: [
        {
          at: ['$plus', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$plus', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a node whose child always fails never runs',
      expression: { $plus: ['$data.n', { $divide: [1, 0] }] },
      uncovered: [{ at: ['$plus', 1], code: 'non-finite-result', will: true }],
      open: 'Is plus’s own type check on values reported, although plus can never run? Expected: no — fix the certain failure first',
    },
  ],

  'Laziness and deciders': [
    {
      name: 'a branch that may be taken',
      expression: { $if: ['$data.c', { $lower: '$data.s' }, 'x'] },
      uncovered: [
        { at: ['$if', 1], code: 'type-check', parameter: 'value', witness: { c: true, s: 1 } },
      ],
    },
    {
      name: 'a branch a constant condition never takes',
      expression: { $if: [true, 'x', { $lower: '$data.s' }] },
    },
    {
      name: 'a computed branch a constant condition takes',
      expression: { $if: [true, { $lower: '$data.s' }, 'x'] },
      uncovered: [{ at: ['$if', 1], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    {
      name: 'a certain failure in the branch a constant condition takes',
      expression: { $if: [false, 'x', { $divide: [1, 0] }] },
      uncovered: [{ at: ['$if', 2], code: 'non-finite-result', will: true }],
    },
    {
      name: 'a certain failure in a branch never taken',
      expression: { $if: [true, 'x', { $divide: [1, 0] }] },
      open: 'Dead code that would always fail: worth a separate warning? Not a coverage finding',
    },
    {
      name: 'or decided by a constant',
      expression: { $or: [true, { $lower: '$data.s' }] },
    },
    {
      name: 'or decided by a constant still starts every operand',
      expression: { $or: [true, { $divide: [1, '$data.n'], fallback: 0 }] },
      covered: [
        {
          at: ['$or', 1],
          code: 'type-check',
          parameter: 'by',
          by: ['$or', 1],
          witness: { n: 'a' },
        },
        {
          at: ['$or', 1],
          code: 'non-finite-result',
          parameter: 'by',
          by: ['$or', 1],
          witness: { n: 0 },
        },
      ],
    },
    {
      name: 'or not decided by a constant',
      expression: { $or: [false, { $lower: '$data.s' }] },
      uncovered: [{ at: ['$or', 1], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    {
      name: 'and with a computed operand',
      expression: { $and: ['$data.a', { $lower: '$data.s' }] },
      uncovered: [
        { at: ['$and', 1], code: 'type-check', parameter: 'value', witness: { a: true, s: 1 } },
      ],
    },
    {
      name: 'firstOf stops at a known non-null candidate',
      expression: { $firstOf: [1, { $lower: '$data.s' }] },
    },
    {
      name: 'firstOf past a computed candidate',
      expression: { $firstOf: ['$data.a', { $lower: '$data.s' }] },
      uncovered: [
        {
          at: ['$firstOf', 1],
          code: 'type-check',
          parameter: 'value',
          witness: { a: null, s: 1 },
        },
      ],
    },
    {
      name: 'firstOf always evaluates its first candidate',
      expression: { $firstOf: [{ $lower: '$data.s' }, 'x'] },
      uncovered: [
        { at: ['$firstOf', 0], code: 'type-check', parameter: 'value', witness: { s: 1 } },
      ],
    },
    {
      name: 'match with a known value never runs the other branches',
      expression: { $match: { value: 'a', branches: { a: 1, b: { $divide: [1, 0] } } } },
    },
    {
      name: 'match with a computed value may run any branch',
      expression: {
        $match: { value: '$data.k', branches: { a: 1, b: { $divide: [1, 0] } }, default: 0 },
      },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'value', witness: { k: [] } },
        {
          at: ['$match', 'branches', 'b'],
          code: 'non-finite-result',
          will: true,
          witness: { k: 'b' },
        },
      ],
    },
    {
      name: 'some, folded past a failing element',
      expression: { $some: { input: [0, 1], each: { $divide: [1, '$element'] } } },
    },
    {
      name: 'some, every element failing',
      expression: { $some: { input: [1, 2], each: { $lower: '$element' } } },
      uncovered: [{ at: ['$some', 'each'], code: 'type-check', will: true }],
    },
    {
      name: 'every over computed input',
      expression: { $every: { input: '$data.list', each: { $lower: '$element' } } },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'input', witness: { list: 'x' } },
        {
          at: ['$every', 'each'],
          code: 'type-check',
          parameter: 'value',
          witness: { list: [1] },
        },
      ],
    },
    {
      name: 'a lazy default is never demanded on a known hit',
      expression: { $get: { path: 'x', from: { x: 1 }, default: { $divide: [1, 0] } } },
    },
    {
      name: 'a lazy default may be demanded',
      expression: { $get: { path: 'x', from: '$data.o', default: { $lower: '$data.s' } } },
      uncovered: [
        {
          at: ['$get', 'default'],
          code: 'type-check',
          parameter: 'value',
          witness: { o: {}, s: 1 },
        },
      ],
    },
    {
      name: 'a null replacement runs only on a null',
      expression: { $plus: { values: ['$data.a', 1], nullValueDefault: { $lower: '$data.s' } } },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'values', witness: { a: 'x' } },
        {
          at: ['$plus', 'nullValueDefault'],
          code: 'type-check',
          parameter: 'value',
          witness: { a: null, s: 1 },
        },
      ],
    },
  ],

  'Iterators and bindings': [
    {
      name: 'untyped input and elements',
      expression: { $map: { input: '$data.list', each: { $plus: ['$element', 1] } } },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'input', witness: { list: 'x' } },
        {
          at: ['$map', 'each'],
          code: 'type-check',
          parameter: 'values',
          witness: { list: ['a'] },
        },
      ],
    },
    {
      name: 'a constant input folds',
      expression: { $map: { input: [1, 2, 3], each: { $plus: ['$element', 1] } } },
    },
    {
      name: '$element takes the input’s element type',
      expression: {
        $map: {
          input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
          nullInputDefault: [],
          each: { $upper: '$element' },
        },
      },
      covered: [
        {
          at: ['$map', 'input', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$map', 'input', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a renamed binding',
      expression: {
        $map: {
          input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
          nullInputDefault: [],
          as: 'word',
          each: { $upper: '$word' },
        },
      },
      covered: [
        {
          at: ['$map', 'input', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$map', 'input', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: '$index is an integer',
      expression: {
        $map: { input: '$data.list', nullInputDefault: [], each: { $plus: ['$index', 1] } },
      },
      uncovered: [{ at: [], code: 'type-check', parameter: 'input', witness: { list: 'x' } }],
    },
    {
      name: 'an element type that does not fit',
      expression: {
        $map: {
          input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
          nullInputDefault: [],
          each: { $plus: ['$element', 1] },
        },
      },
      uncovered: [
        { at: ['$map', 'each'], code: 'type-check', parameter: 'values', witness: { s: 'a' } },
      ],
      covered: [
        {
          at: ['$map', 'input', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$map', 'input', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'filter keeps its input’s element type',
      expression: {
        $map: {
          input: {
            $filter: {
              input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
              nullInputDefault: [],
              each: '$element',
            },
          },
          each: { $upper: '$element' },
        },
      },
      covered: [
        {
          at: ['$map', 'input', '$filter', 'input', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$map', 'input', '$filter', 'input', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'find returns an element or its noMatchDefault',
      expression: {
        $upper: {
          $find: {
            input: { $split: [{ $lower: '$data.s', fallback: '' }, ','] },
            nullInputDefault: [],
            each: { $equal: ['$element', 'b'] },
            noMatchDefault: '',
          },
        },
      },
      covered: [
        {
          at: ['$upper', '$find', 'input', '$split', 0],
          code: 'type-check',
          parameter: 'value',
          by: ['$upper', '$find', 'input', '$split', 0],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'nested iterators over constants fold',
      expression: {
        $map: {
          input: [[1, 2], [3]],
          each: { $map: { input: '$element', each: { $plus: ['$element', 1] } } },
        },
      },
    },
    {
      name: 'nested iterators over data',
      expression: {
        $map: {
          input: '$data.rows',
          nullInputDefault: [],
          each: { $map: { input: '$element', each: { $plus: ['$element', 1] } } },
        },
      },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'input', witness: { rows: 'x' } },
        {
          at: ['$map', 'each'],
          code: 'type-check',
          parameter: 'input',
          witness: { rows: ['x'] },
        },
        {
          at: ['$map', 'each', '$map', 'each'],
          code: 'type-check',
          parameter: 'values',
          witness: { rows: [['a']] },
        },
      ],
    },
  ],

  'Per-element walks': [
    {
      name: 'a decider decided early still starts every element',
      expression: { $some: { input: [1, 0], each: { $divide: [1, '$element'], fallback: false } } },
      covered: [
        {
          at: ['$some', 'each'],
          code: 'non-finite-result',
          parameter: 'by',
          by: ['$some', 'each'],
          witness: {},
        },
      ],
    },
    {
      name: 'every, with nothing deciding, fails on an element’s parked failure',
      expression: { $every: { input: [0, 1], each: { $divide: [1, '$element'] } } },
      uncovered: [
        { at: ['$every', 'each'], code: 'non-finite-result', parameter: 'by', witness: {} },
      ],
    },
    {
      name: 'a renamed $index, per element',
      expression: { $some: { input: ['a', 'b'], as: 'n', each: { $divide: [1, '$nIndex'] } } },
    },
    {
      name: 'a vars block in each is walked per element',
      expression: {
        $map: {
          input: [2, 1],
          each: { $divide: [1, '$vars.d'], vars: { d: { $subtract: ['$element', 1] } } },
        },
      },
      uncovered: [
        { at: ['$map', 'each'], code: 'non-finite-result', parameter: 'by', witness: {} },
      ],
    },
    {
      name: 'a var in each reads the bindings where it is declared',
      expression: {
        $map: {
          input: [['a'], ['b']],
          each: {
            $map: { input: '$element', each: { $upper: '$vars.x' } },
            vars: { x: '$element' },
          },
        },
      },
      uncovered: [
        {
          at: ['$map', 'each', '$map', 'each'],
          code: 'type-check',
          parameter: 'value',
          will: true,
        },
      ],
    },
    {
      name: 'nested iterators, per element',
      expression: {
        $map: {
          input: [[0, 1], [2]],
          each: { $some: { input: '$element', each: { $divide: [1, '$element'] } } },
        },
      },
    },
    {
      name: 'a map not run keeps what each element gave, in order',
      expression: {
        $max: {
          $map: {
            input: [1, 2],
            each: { $plus: ['$element', { $length: '$data.s', fallback: 0 }] },
          },
        },
      },
      covered: [
        {
          at: ['$max', '$map', 'each', '$plus', 1],
          code: 'type-check',
          parameter: 'value',
          by: ['$max', '$map', 'each', '$plus', 1],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'past 16 elements, each is walked once',
      expression: {
        $some: {
          input: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
          each: { $divide: [1, '$element'] },
        },
      },
      uncovered: [{ at: ['$some', 'each'], code: 'non-finite-result', parameter: 'by' }],
      note: 'Element 1 decides some before element 0’s division by 0 matters, but an each over more than 16 elements is walked once, with $element any of them',
    },
  ],

  Vars: [
    {
      name: 'a var’s type flows to its references',
      expression: { $multiply: ['$vars.n', 2], vars: { n: { $length: '$data.s', fallback: 0 } } },
      covered: [
        {
          at: ['vars', 'n'],
          code: 'type-check',
          parameter: 'value',
          by: ['vars', 'n'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a failure in a var is reported at its definition',
      expression: { $upper: '$vars.n', vars: { n: { $lower: '$data.s' } } },
      uncovered: [{ at: ['vars', 'n'], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    {
      name: 'a var referenced twice is reported once',
      expression: {
        $plus: [{ $upper: '$vars.n' }, { $trim: '$vars.n' }],
        vars: { n: { $lower: '$data.s' } },
      },
      uncovered: [{ at: ['vars', 'n'], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    {
      name: 'vars on plain data',
      expression: { vars: { n: { $lower: '$data.s' } }, a: '$vars.n', b: { $upper: '$vars.n' } },
      uncovered: [{ at: ['vars', 'n'], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    {
      name: 'drilling a known var under strictDataPaths',
      expression: { $plus: ['$vars.o.a', 1], vars: { o: { a: 1 } } },
      instance: 'strict',
    },
    {
      name: 'drilling a known var past a missing key, under strictDataPaths',
      expression: { $plus: ['$vars.o.b', 1], vars: { o: { a: 1 } } },
      instance: 'strict',
      uncovered: [{ at: ['$plus', 0], code: 'missing-data-path', will: true }],
    },
  ],

  Fragments: [
    {
      name: 'a call with constant arguments folds',
      expression: { $double: { n: 3 } },
      instance: 'fragments',
    },
    {
      name: 'an untyped argument',
      expression: { $double: { n: '$data.x' } },
      instance: 'fragments',
      uncovered: [
        { at: ['$double', 'n'], code: 'type-check', parameter: 'n', witness: { x: 'a' } },
      ],
    },
    {
      name: 'a propagated null at a parameter that excludes null',
      expression: { $double: { n: { $length: '$data.s', fallback: 0 } } },
      instance: 'fragments',
      uncovered: [
        { at: ['$double', 'n'], code: 'type-check', parameter: 'n', witness: { s: null } },
      ],
      covered: [
        {
          at: ['$double', 'n'],
          code: 'type-check',
          parameter: 'value',
          by: ['$double', 'n'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a parameter that admits null',
      expression: { $maybeDouble: { n: { $length: '$data.s', fallback: 0 } } },
      instance: 'fragments',
      covered: [
        {
          at: ['$maybeDouble', 'n'],
          code: 'type-check',
          parameter: 'value',
          by: ['$maybeDouble', 'n'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a failure inside the body, reported at the call',
      expression: { $ratio: { a: 1, b: { $length: '$data.s', fallback: 1 } } },
      instance: 'fragments',
      uncovered: [
        {
          at: [],
          fragment: 'ratio',
          fragmentPath: ['expression'],
          code: 'non-finite-result',
          parameter: 'by',
          witness: { s: '' },
        },
        { at: ['$ratio', 'b'], code: 'type-check', parameter: 'b', witness: { s: null } },
      ],
      covered: [
        {
          at: ['$ratio', 'b'],
          code: 'type-check',
          parameter: 'value',
          by: ['$ratio', 'b'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a fallback on the body root covers the call, arguments included',
      expression: { $safeRatio: { a: 1, b: { $length: '$data.s', fallback: 1 } } },
      instance: 'fragments',
      covered: [
        {
          at: [],
          fragment: 'safeRatio',
          fragmentPath: ['expression'],
          code: 'non-finite-result',
          parameter: 'by',
          by: [],
          byFragmentPath: ['expression'],
          witness: { s: '' },
        },
        {
          at: ['$safeRatio', 'b'],
          code: 'type-check',
          parameter: 'b',
          by: [],
          byFragmentPath: ['expression'],
          witness: { s: null },
        },
        {
          at: ['$safeRatio', 'b'],
          code: 'type-check',
          parameter: 'value',
          by: ['$safeRatio', 'b'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a call nested under an operator',
      expression: { $plus: [{ $ratio: { a: 1, b: { $length: '$data.s', fallback: 1 } } }, 1] },
      instance: 'fragments',
      uncovered: [
        {
          at: ['$plus', 0],
          fragment: 'ratio',
          fragmentPath: ['expression'],
          code: 'non-finite-result',
          parameter: 'by',
          witness: { s: '' },
        },
        {
          at: ['$plus', 0, '$ratio', 'b'],
          code: 'type-check',
          parameter: 'b',
          witness: { s: null },
        },
      ],
      covered: [
        {
          at: ['$plus', 0, '$ratio', 'b'],
          code: 'type-check',
          parameter: 'value',
          by: ['$plus', 0, '$ratio', 'b'],
          witness: { s: 1 },
        },
      ],
    },
    {
      name: 'a body analysed with its arguments’ types',
      expression: { $shout: { s: { $lower: '$data.x', fallback: 'a' } } },
      instance: 'fragments',
      uncovered: [
        { at: ['$shout', 's'], code: 'type-check', parameter: 's', witness: { x: null } },
      ],
      covered: [
        {
          at: ['$shout', 's'],
          code: 'type-check',
          parameter: 'value',
          by: ['$shout', 's'],
          witness: { x: 1 },
        },
      ],
    },
    {
      name: 'a dynamic call',
      expression: { fragment: 'double', parameters: '$data.args' },
      instance: 'fragments',
      uncovered: [
        { at: ['parameters'], code: 'type-check', witness: { args: 5 } },
        { at: ['parameters'], code: 'missing-required', witness: { args: {} } },
      ],
    },
    {
      name: 'a dynamic call’s arguments fail outside the body’s fallback',
      expression: { fragment: 'safeRatio', parameters: '$data.args' },
      instance: 'fragments',
      uncovered: [
        { at: ['parameters'], code: 'type-check', witness: { args: { a: 1, b: 'x' } } },
        { at: ['parameters'], code: 'missing-required', witness: { args: {} } },
      ],
      covered: [
        {
          at: [],
          fragment: 'safeRatio',
          fragmentPath: ['expression'],
          code: 'non-finite-result',
          parameter: 'by',
          by: [],
          byFragmentPath: ['expression'],
          witness: { args: { a: 1, b: 0 } },
        },
      ],
    },
    {
      name: 'a certain failure the body may skip leaves the call’s parents their checks',
      expression: { $divide: [1, { $subtract: [{ $maybeFail: { c: '$data.c' } }, 1] }] },
      instance: 'fragments',
      uncovered: [
        { at: [], code: 'non-finite-result', parameter: 'by', will: true },
        {
          at: ['$divide', 1, '$subtract', 0],
          fragment: 'maybeFail',
          fragmentPath: ['expression', '$if', 1],
          code: 'non-finite-result',
          parameter: 'by',
          will: true,
          witness: { c: true },
        },
      ],
    },
    {
      name: 'a certain failure an argument may skip leaves the call’s parents their checks',
      expression: {
        $divide: [
          1,
          { $subtract: [{ $ratio: { a: { $if: ['$data.c', { $divide: [1, 0] }, 2] }, b: 2 } }, 1] },
        ],
      },
      instance: 'fragments',
      uncovered: [
        { at: [], code: 'non-finite-result', parameter: 'by', will: true },
        {
          at: ['$divide', 1, '$subtract', 0, '$ratio', 'a', '$if', 1],
          code: 'non-finite-result',
          parameter: 'by',
          will: true,
          witness: { c: true },
        },
      ],
    },
  ],

  'Plain data': [
    {
      name: 'a failure inside plain data',
      expression: { a: { $lower: '$data.s' }, b: 1 },
      uncovered: [{ at: ['a'], code: 'type-check', parameter: 'value', witness: { s: 1 } }],
    },
    {
      name: 'a certain failure inside an array',
      expression: [1, { $divide: [1, 0] }],
      uncovered: [{ at: [1], code: 'non-finite-result', will: true }],
    },
    { name: 'plain data that folds', expression: { a: { $plus: [1, 2] } } },
  ],

  Options: [
    {
      name: 'strictDataPaths on a reference inside a parameter',
      expression: { $plus: ['$data.n', 1] },
      instance: 'strict',
      uncovered: [
        { at: ['$plus', 0], code: 'missing-data-path', witness: {} },
        { at: [], code: 'type-check', parameter: 'values', witness: { n: 'a' } },
      ],
    },
    {
      name: 'strictDataPaths on get',
      expression: { $get: 'a.b' },
      instance: 'strict',
      uncovered: [{ at: [], code: 'missing-data-path', witness: {} }],
    },
    {
      name: 'a get default opts out of strictDataPaths',
      expression: { $get: { path: 'a.b', default: 0 } },
      instance: 'strict',
    },
    {
      name: 'strictDataPaths on get from a known object',
      expression: { $get: { path: 'b', from: { a: 1 } } },
      instance: 'strict',
      uncovered: [{ at: [], code: 'missing-data-path', will: true }],
    },
    {
      name: 'ordinary numbers: no overflow on plus',
      expression: {
        $plus: [
          { $convert: ['$data.a', 'number'], fallback: 0 },
          { $convert: ['$data.b', 'number'], fallback: 0 },
        ],
      },
      covered: [
        { at: ['$plus', 0], code: 'operator-failure', by: ['$plus', 0], witness: { a: 'x' } },
        {
          at: ['$plus', 0],
          code: 'non-finite-result',
          by: ['$plus', 0],
          witness: { a: 'Infinity' },
        },
        { at: ['$plus', 1], code: 'operator-failure', by: ['$plus', 1], witness: { b: 'x' } },
        {
          at: ['$plus', 1],
          code: 'non-finite-result',
          by: ['$plus', 1],
          witness: { b: 'Infinity' },
        },
      ],
    },
    {
      name: 'strict numbers: plus may overflow',
      expression: {
        $plus: [
          { $convert: ['$data.a', 'number'], fallback: 0 },
          { $convert: ['$data.b', 'number'], fallback: 0 },
        ],
      },
      options: { strictNumbers: true },
      uncovered: [{ at: [], code: 'non-finite-result', witness: { a: '1e308', b: '1e308' } }],
      covered: [
        { at: ['$plus', 0], code: 'operator-failure', by: ['$plus', 0], witness: { a: 'x' } },
        {
          at: ['$plus', 0],
          code: 'non-finite-result',
          by: ['$plus', 0],
          witness: { a: 'Infinity' },
        },
        { at: ['$plus', 1], code: 'operator-failure', by: ['$plus', 1], witness: { b: 'x' } },
        {
          at: ['$plus', 1],
          code: 'non-finite-result',
          by: ['$plus', 1],
          witness: { b: 'Infinity' },
        },
      ],
    },
    {
      name: 'ordinary numbers: data is finite',
      expression: { $floor: '$data.n' },
      uncovered: [{ at: [], code: 'type-check', parameter: 'value', witness: { n: 'a' } }],
    },
    {
      name: 'strict numbers: data may be NaN',
      expression: { $floor: '$data.n' },
      options: { strictNumbers: true },
      uncovered: [
        { at: [], code: 'type-check', parameter: 'value', witness: { n: 'a' } },
        { at: [], code: 'non-finite-result', witness: { n: NaN } },
      ],
    },
  ],

  'I/O and timeouts': [
    {
      name: 'a request can always fail',
      expression: { $http: 'https://x.test/a' },
      instance: 'io',
      uncovered: [
        { at: [], code: 'operator-failure', external: true, client: 'fails', witness: {} },
      ],
    },
    {
      name: 'a request with a fallback',
      expression: { $http: 'https://x.test/a', fallback: null },
      instance: 'io',
      covered: [
        { at: [], code: 'operator-failure', external: true, by: [], client: 'fails', witness: {} },
      ],
    },
    {
      name: 'a response is untyped, and is never fetched by the analysis',
      expression: {
        $plus: [{ $http: { url: 'https://x.test/a', returnPath: 's' }, fallback: 0 }, 1],
      },
      instance: 'io',
      uncovered: [{ at: [], code: 'type-check', parameter: 'values', witness: {} }],
      covered: [
        {
          at: ['$plus', 0],
          code: 'operator-failure',
          external: true,
          by: ['$plus', 0],
          client: 'fails',
          witness: {},
        },
      ],
    },
    {
      name: 'a relative URL with no baseEndpoint fails every time',
      expression: { $http: '/users' },
      instance: 'io',
      uncovered: [{ at: [], code: 'operator-failure', external: true, witness: {} }],
      note: 'The request is refused with type-check, which the external finding stands for; it is certain, but an external operator is never run, so it is reported as may fail',
    },
    {
      name: 'a relative URL with a baseEndpoint',
      expression: { $http: '/users' },
      instance: 'ioBase',
      uncovered: [
        { at: [], code: 'operator-failure', external: true, client: 'fails', witness: {} },
      ],
    },
    {
      name: 'graphQL with no endpoint fails every time',
      expression: { $graphQL: 'query { a }' },
      instance: 'io',
      uncovered: [{ at: [], code: 'operator-failure', external: true, witness: {} }],
      note: 'Certain, but an external operator is never run, so it is reported as may fail',
    },
    {
      name: 'a query can always fail',
      expression: { $sql: 'SELECT a FROM t' },
      instance: 'io',
      uncovered: [
        { at: [], code: 'operator-failure', external: true, client: 'fails', witness: {} },
      ],
    },
    {
      name: 'a single-value shape over rows the query decides',
      expression: { $sql: { query: 'SELECT a, b FROM t', shape: 'firstValue' } },
      instance: 'io',
      uncovered: [{ at: [], code: 'operator-failure', external: true, witness: {} }],
      note: 'A row of other than one column is refused with type-check, which the external finding stands for, as it does for the client failing',
    },
    {
      name: 'a computed method',
      expression: { $http: { url: 'https://x.test/a', method: '$data.m', body: { a: 1 } } },
      instance: 'io',
      uncovered: [
        { at: [], code: 'type-check', parameter: 'method', witness: { m: 'put' } },
        { at: [], code: 'operator-failure', external: true, witness: { m: 'get' } },
      ],
      note: 'A GET carrying a body is refused with type-check, which the external finding stands for, as it does for the client failing',
    },
    {
      name: 'a computed query value',
      expression: { $http: { url: 'https://x.test/a', query: { q: '$data.q' } } },
      instance: 'io',
      uncovered: [{ at: [], code: 'operator-failure', external: true, witness: { q: [1] } }],
      note: 'A composite query value is refused with type-check, which the external finding stands for, as it does for the client failing',
    },
    {
      name: 'a constant fallback shields a request from a timeout',
      expression: { $http: 'https://x.test/a', fallback: null },
      instance: 'io',
      timeout: 20,
      covered: [
        { at: [], code: 'operator-failure', external: true, by: [], client: 'fails', witness: {} },
        { at: [], code: 'timeout', by: [], client: 'slow', witness: {} },
      ],
    },
    {
      name: 'a fallback that folds is still not a constant to shielding',
      expression: { $http: 'https://x.test/a', fallback: { $lower: 'X' } },
      instance: 'io',
      timeout: 20,
      uncovered: [{ at: [], code: 'timeout', client: 'slow', witness: {} }],
      covered: [
        { at: [], code: 'operator-failure', external: true, by: [], client: 'fails', witness: {} },
      ],
    },
    {
      name: 'under a timeout, a value doing no I/O still needs a constant fallback when another does I/O',
      expression: { a: { $http: 'https://x.test/a', fallback: 1 }, b: { $upper: 'x' } },
      instance: 'io',
      timeout: 20,
      uncovered: [{ at: ['b'], code: 'timeout', client: 'slow', witness: {} }],
      covered: [
        {
          at: ['a'],
          code: 'operator-failure',
          external: true,
          by: ['a'],
          client: 'fails',
          witness: {},
        },
      ],
      note: 'Shielding is all-or-nothing: if any value is unshielded, the deadline rejects the whole evaluation',
    },
    {
      name: 'under a timeout, nothing doing I/O means nothing can be cut off',
      expression: { a: { $upper: 'x' }, b: { $lower: 'Y' } },
      timeout: 20,
    },
    {
      name: 'a constant fallback on the root shields everything under it',
      expression: {
        $plus: [{ $http: { url: 'https://x.test/a', returnPath: 's' }, fallback: 1 }, 1],
        fallback: 0,
      },
      instance: 'io',
      timeout: 20,
      covered: [
        { at: [], code: 'type-check', parameter: 'values', by: [], witness: {} },
        {
          at: ['$plus', 0],
          code: 'operator-failure',
          external: true,
          by: ['$plus', 0],
          client: 'fails',
          witness: {},
        },
        { at: [], code: 'timeout', by: [], client: 'slow', witness: {} },
      ],
    },
    {
      name: 'under a timeout, a shielded value doing no I/O is never cut off',
      expression: {
        a: { $http: 'https://x.test/a', fallback: 1 },
        b: { $upper: 'x', fallback: 'X' },
      },
      instance: 'io',
      timeout: 20,
      covered: [
        {
          at: ['a'],
          code: 'operator-failure',
          external: true,
          by: ['a'],
          client: 'fails',
          witness: {},
        },
        { at: ['a'], code: 'timeout', by: ['a'], client: 'slow', witness: {} },
      ],
    },
    {
      name: 'under a timeout, a request read through a var can wait',
      expression: {
        a: '$vars.r',
        b: { $upper: 'x' },
        vars: { r: { $http: 'https://x.test/a', fallback: null } },
      },
      instance: 'io',
      timeout: 20,
      uncovered: [
        { at: ['a'], code: 'timeout', client: 'slow', witness: {} },
        { at: ['b'], code: 'timeout', client: 'slow', witness: {} },
      ],
      covered: [
        {
          at: ['vars', 'r'],
          code: 'operator-failure',
          external: true,
          by: ['vars', 'r'],
          client: 'fails',
          witness: {},
        },
      ],
    },
    {
      name: 'under a timeout, a request in a fallback can wait',
      expression: {
        a: { $upper: '$data.s', fallback: { $http: 'https://x.test/a' } },
        b: { $lower: 'Y' },
      },
      instance: 'io',
      timeout: 20,
      uncovered: [
        {
          at: ['a', 'fallback'],
          code: 'operator-failure',
          external: true,
          client: 'fails',
          witness: { s: 1 },
        },
        { at: ['a'], code: 'timeout', client: 'slow', witness: { s: 1 } },
        { at: ['b'], code: 'timeout', client: 'slow', witness: { s: 1 } },
      ],
      covered: [
        { at: ['a'], code: 'type-check', parameter: 'value', by: ['a'], witness: { s: 1 } },
      ],
    },
    {
      name: 'under a timeout, a request in a branch never taken never waits',
      expression: {
        a: { $if: [true, 1, { $http: 'https://x.test/a' }] },
        b: { $upper: 'x' },
      },
      instance: 'io',
      timeout: 20,
    },
    {
      name: 'under a timeout, a request a decider never waits for',
      expression: { a: { $or: [true, { $http: 'https://x.test/a' }] }, b: { $upper: 'x' } },
      instance: 'io',
      timeout: 20,
    },
  ],

  'Host operators': [
    {
      name: 'under a timeout, an undeclared host operator may wait',
      expression: { a: { $twice: 2 }, b: { $upper: 'x' } },
      instance: 'host',
      timeout: 20,
      uncovered: [
        { at: ['a'], code: 'operator-failure', external: true },
        { at: ['a'], code: 'timeout' },
        { at: ['b'], code: 'timeout' },
      ],
      note: 'False positives the design accepts: twice never throws and never waits, but nothing says so',
    },
    {
      name: 'under a timeout, a declared host operator may wait',
      expression: { a: { $nap: 1 } },
      instance: 'host',
      timeout: 20,
      uncovered: [{ at: ['a'], code: 'timeout', witness: {} }],
    },
    {
      name: 'an undeclared host operator may throw',
      expression: { $twice: 2 },
      instance: 'host',
      uncovered: [{ at: [], code: 'operator-failure', external: true }],
      note: 'A false positive the design accepts: twice never throws, but nothing says so, so it is neither run nor trusted',
    },
    {
      name: 'a host operator that does throw',
      expression: { $shaky: '$data.s' },
      instance: 'host',
      uncovered: [
        { at: [], code: 'type-check', parameter: 'value', witness: { s: 1 } },
        { at: [], code: 'operator-failure', external: true, witness: { s: '' } },
      ],
    },
    {
      name: 'a host operator that declares its failures',
      expression: { $picky: '$data.s' },
      instance: 'host',
      uncovered: [
        { at: [], code: 'type-check', parameter: 'value', witness: { s: 1 } },
        { at: [], code: 'operator-failure', parameter: 'value', witness: { s: '' } },
      ],
    },
    {
      name: 'a declared host operator whose rule cannot hold',
      expression: { $picky: { $upper: 'x' } },
      instance: 'host',
    },
  ],
}
