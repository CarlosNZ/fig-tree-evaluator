/**
 * Everything the two Conforma benches share: the corpus in both spellings,
 * data under which every lookup resolves, instant stand-ins for HTTP and
 * Postgres, the custom functions the templates call, and the two ways of
 * cutting a template into evaluation units.
 *
 * The data is invented but shaped like the real thing: every path the
 * corpus reads resolves, lists are arrays, and the organisation record
 * carries every field the `orgInfo` template renders. Two paths drill
 * through a `.list.` segment with no index; migrate.ts turns those into
 * v3's `[*]` projection, which is what v2's map-over-array meant.
 *
 * I/O returns instantly and deterministically. That is not realistic and
 * is not meant to be: the question is what the engines cost, and a
 * network round trip is three orders of magnitude larger than anything
 * measured here.
 */
import { FigTreeEvaluator } from '../../v2-src'
import type { EvaluatorNode, FigTreeOptions } from '../../v2-src/types'
import { FigTree, coreOperators, defineOperator, httpOperators, sqlOperators } from '../../src'
import type { HttpClient, SqlConnection } from '../../src'
import { dumpV3, fragmentBodyToV3, toV3 } from './migrate'
import elementsJson from './conforma-template-elements.json'
import actionsJson from './conforma-template-actions.json'

/** A template as exported: one record per element or action, keyed by code. */
type Template = Record<string, Record<string, unknown>>

// ── The corpus, both spellings ──────────────────────────────────────────

export const elementsV2 = elementsJson as unknown as Template
export const actionsV2 = actionsJson as unknown as Template
export const elementsV3 = toV3(elementsV2) as Template
export const actionsV3 = toV3(actionsV2) as Template
void dumpV3('conforma-template-elements', elementsV3)
void dumpV3('conforma-template-actions', actionsV3)

// ── Data ────────────────────────────────────────────────────────────────

const product = {
  activeIngredients: { list: [{ name: 'Amoxicillin', strength: '500mg' }] },
  activeIngredientsResponse: { list: [{ name: 'Amoxicillin', strength: '500mg' }] },
  atcCode: { selection: 'J01CA04' },
  dosageForm: 'Tablet',
  packSizesResponse: { list: [{ packsize: { value: { text: '10 tablets' } } }] },
  packagingSizesForm: { list: [{ size: '10 tablets' }] },
  pharmacopeia: 'BP',
  productId: 'FJ-2026-0042',
  productIdOriginal: 'AUST R 12345',
  routeOfAdministration: 'Oral',
  shelfLife: '36 months',
  storageConditions: 'Store below 25°C',
  tradeName: 'Amoxil',
}

const item = { code: 'AMOX500', item_name: 'Amoxicillin 500mg tablet' }

/** The applicant's organisation, as a data view returns it. */
const organisation = {
  name: 'Acme Pharma',
  type: { text: 'Manufacturer' },
  address: '12 Harbour St, Suva',
  country: 'Fiji',
  contactName: 'Ada Lovelace',
  contactPhone: '+679 330 0000',
  fax: '+679 330 0001',
  contactEmail: 'ada@acme.test',
  regulatoryActivity: { text: 'Registration' },
}

/** What a form element sees: the applicant's responses so far, plus context. */
export const elementData = (searchText: string) => ({
  applicationData: {
    config: { serverREST: 'https://server.test/api' },
    current: { stage: { name: 'Assessment' } },
  },
  currentUser: { organisation: { orgId: 7 } },
  search: { text: searchText },
  responses: {
    countriesOfRegistration: { selection: ['Australia', 'New Zealand'] },
    countrySelect: { selection: 'Fiji', text: 'Fiji' },
    countrySelectAggregate: { data: 'Fiji, Australia, New Zealand' },
    isManufacturer: { selection: 'Yes' },
    legalClass: { optionIndex: 1 },
    mSupplyItem: { selection: [item] },
    manufacturers: { list: [{ country: { value: { selection: 'Fiji' } } }] },
    noApprovedCountry: { data: 'None' },
    orgData: { data: organisation },
    otherCountrySelect: { text: 'Tonga' },
    prodSelect: { selection: [product] },
    thisResponse: 'A response',
  },
})

/**
 * What an action sees: the submitted application, and what the actions
 * before it produced.
 */
export const actionData = {
  applicationData: {
    applicationId: 101,
    applicationSerial: 'S-2026-0042',
    email: 'applicant@example.test',
    orgId: 7,
    orgName: 'Acme Pharma',
    outcome: 'PENDING',
    stage: 'Assessment',
    stageNumber: 2,
    username: 'carl',
    firstName: 'Ada',
    lastName: 'Lovelace',
    environmentData: { webHostUrl: 'https://conforma.test' },
    responses: {
      Generics: {
        list: [
          {
            ingredient: { value: { text: 'Amoxicillin' } },
            quantity: { value: { text: '500' } },
            unit: { value: { text: 'mg' } },
            additionalInfo: { value: { text: 'Generic equivalents exist' } },
          },
        ],
      },
      brandName: { text: 'Amoxil' },
      countriesOfRegistration: { text: 'Australia, New Zealand' },
      countrySelect: { selection: 'Fiji', text: 'Fiji' },
      dosageForm: { text: 'Tablet' },
      dosageFormGeneral: { text: 'Solid oral' },
      legalClass: { selection: 'Prescription' },
      mSupplyItem: { selection: [item] },
      mSupplyItemReviewer: {
        selection: [{ code: 'AMOX500R', item_name: 'Amoxicillin 500mg (reviewed)' }],
      },
      manName: { text: 'Acme Manufacturing' },
      manufacturers: { list: [{ address: { value: { text: '1 Factory Rd\nSuva\nFiji' } } }] },
      orgData: { data: organisation },
      packagingSizes: { text: '10 tablets' },
      prodSelect: { selection: [product] },
    },
    reviewData: { latestDecision: { comment: 'Looks good', decision: 'LIST_OF_QUESTIONS' } },
  },
  outputCumulative: { document: { uniqueId: 'doc-7f3a' }, generatedText: 'FJ-2026-0042' },
}

// ── Custom functions, registered both ways ──────────────────────────────

/** Conforma's host functions, reduced to deterministic stand-ins. */
const fns = {
  flattenLines: (text: unknown, opts?: { separator?: string }) =>
    String(text)
      .split('\n')
      .join(opts?.separator ?? ' '),
  getFormattedDate: () => '22 September, 2026',
  getJSDate: () => '2026-09-22T00:00:00.000Z',
}

/** v3: each becomes an operator taking its arguments positionally. */
const customOperators = Object.entries(fns).map(([name, fn]) =>
  defineOperator({
    name,
    category: 'other',
    description: `Conforma host function ${name}`,
    parameters: { args: { type: 'array', required: false, default: [] } },
    positionalParams: ['...args'],
    returns: 'any',
    evaluate: ({ args }) => (fn as (...a: unknown[]) => unknown)(...(args as unknown[])),
  })
)

// ── Instant I/O ─────────────────────────────────────────────────────────

const RESPONSE = {
  code: 'AMOX',
  shortDescription: 'Amoxicillin 500mg',
  nameCommon: 'Fiji',
  data: [],
}
const ROWS = [{ id: 42 }]

const v3Http: HttpClient = { request: async () => RESPONSE }
const v3Sql: SqlConnection = { query: async () => ROWS }

const v2Http = {
  get: async () => RESPONSE,
  post: async () => RESPONSE,
  throwError: (err: unknown) => {
    throw err
  },
}
const v2Sql = { query: async () => ROWS }

// ── Fragments ───────────────────────────────────────────────────────────

/**
 * The three fragments the template calls, as Conforma would define them —
 * two data-view fetches and one outcome check. v2 bodies name their
 * arguments as `$x` strings; the v3 bodies are migrated from them.
 */
const serverREST = { operator: 'getData', property: 'applicationData.config.serverREST' }
const fragmentsV2: Record<string, { body: EvaluatorNode; parameters: string[] }> = {
  'Get Single Entity': {
    parameters: ['id', 'dataViewCode'],
    body: {
      operator: 'POST',
      url: {
        operator: 'stringSubstitution',
        string: '%1/data-views/%2/%3',
        substitutions: [serverREST, '$dataViewCode', '$id'],
      },
    },
  },
  'Search DataView': {
    parameters: ['query', 'resultCount', 'dataViewCode'],
    body: {
      operator: 'POST',
      url: {
        operator: 'stringSubstitution',
        string: '%1/data-views/%2?%3&first=%4',
        substitutions: [serverREST, '$dataViewCode', '$query', '$resultCount'],
      },
    },
  },
  'Application Approved': {
    parameters: [],
    body: {
      operator: '=',
      values: [{ operator: 'getData', property: 'applicationData.outcome' }, 'APPROVED'],
    },
  },
}

const v2Fragments = Object.fromEntries(
  Object.entries(fragmentsV2).map(([k, v]) => [k, v.body])
) as NonNullable<FigTreeOptions['fragments']>
const v3Fragments = Object.fromEntries(
  Object.entries(fragmentsV2).map(([name, { body, parameters }]) => [
    name,
    {
      expression: fragmentBodyToV3(body, parameters),
      parameters: Object.fromEntries(parameters.map((p) => [p, {}])),
    },
  ])
)

// ── Instances ───────────────────────────────────────────────────────────

/**
 * Validated once; every v3 instance, held or cold, registers the same
 * definitions.
 */
const v3Definitions = [coreOperators, customOperators, httpOperators(v3Http), sqlOperators(v3Sql)]

export const newV3 = () => new FigTree({ operators: v3Definitions, fragments: v3Fragments })
export const newV2 = () =>
  new FigTreeEvaluator({
    evaluateFullObject: true,
    httpClient: v2Http,
    sqlConnection: v2Sql,
    functions: fns,
    fragments: v2Fragments,
    useCache: true,
  })

// ── Units ───────────────────────────────────────────────────────────────

export interface Unit {
  label: string
  expr: unknown
}

/** How finely a template is cut before evaluation. */
export type Granularity = 'every-leaf' | 'params-whole' | 'item-whole'

const ELEMENT_PROPERTIES = ['validation', 'is_editable', 'is_required', 'visibility_condition']

/**
 * Elements as the front end evaluates them: each property on its own, and
 * `parameters` either as one object or one key at a time.
 */
export const elementUnits = (template: Template, granularity: Granularity): Unit[] =>
  Object.entries(template).flatMap(([code, element]) => {
    if (granularity === 'item-whole') return [{ label: code, expr: element }]
    const properties = ELEMENT_PROPERTIES.map((key) => ({
      label: `${code}.${key}`,
      expr: element[key],
    }))
    const parameters = element.parameters as Record<string, unknown>
    return [
      ...properties,
      ...(granularity === 'params-whole'
        ? [{ label: `${code}.parameters`, expr: parameters }]
        : Object.entries(parameters).map(([key, expr]) => ({
            label: `${code}.parameters.${key}`,
            expr,
          }))),
    ]
  })

/**
 * Actions the same way: `condition` on its own, and `parameter_queries`
 * whole or one key at a time.
 */
export const actionUnits = (template: Template, granularity: Granularity): Unit[] =>
  Object.entries(template).flatMap(([code, action]) => {
    if (granularity === 'item-whole') return [{ label: code, expr: action }]
    const queries = action.parameter_queries as Record<string, unknown>
    return [
      { label: `${code}.condition`, expr: action.condition },
      ...(granularity === 'params-whole'
        ? [{ label: `${code}.parameter_queries`, expr: queries }]
        : Object.entries(queries).map(([key, expr]) => ({
            label: `${code}.parameter_queries.${key}`,
            expr,
          }))),
    ]
  })

/**
 * A new top-level object with the same bytes — what a host that re-reads
 * its template per render hands over. Defeats the identity layer, hits
 * the content layer, and costs a handful of nanoseconds. Primitives have
 * no identity to defeat and pass through.
 */
export const fresh = (expr: unknown): unknown =>
  Array.isArray(expr) ? [...expr] : typeof expr === 'object' && expr !== null ? { ...expr } : expr
