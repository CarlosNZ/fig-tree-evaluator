/**
 * Running one case ("The differential runner" in
 * docs-dev/v3-specs/v3-converter.md): v2 evaluates the expression, the
 * converter converts it, v3 evaluates the result, and the two outcomes are
 * compared.
 */
import type * as V2 from 'fig-tree-evaluator-v2'
import { FigTree, type MigrationIssue } from '../src'
import { migrateV2Expression } from '../src/migrate'
import { converterOptions, type Case, type V2Io } from './case'
import { onSent, type SentRequest } from './mocks/sent'
import { runV2, sameResult, type Outcome } from './outcome'
import { describeRequest, sameRequests } from './requests'
import { toV3Options, type V3Io, type V3Setup } from './v3Options'

export type Status = '✓' | '⚠' | '✗'

export interface CaseResult {
  entry: Case
  converted: unknown
  /**
   * What the conversion raised: the expression's issues, then those of the
   * fragment definitions it calls, directly or through another fragment
   * (ruled at 15.2's third chunk)
   */
  issues: MigrationIssue[]
  v2: Outcome
  v3: Outcome
  status: Status
  /** The review map's verdict, where it explains a difference */
  note?: string
  /**
   * The requests v3 made that no double answers, which fail v3's outcome
   * (ruled at 15.2's third chunk)
   */
  unanswered?: string[]
  /**
   * What each engine sent the doubles, where either sent anything, and
   * whether the two are the same ("Output")
   */
  requests?: { v2: string[]; v3: string[]; same: boolean }
}

export interface Runner {
  run: (entry: Case) => Promise<CaseResult>
  /** What building v3's evaluators noted: the v2 functions not registered */
  notes: Set<string>
}

/**
 * The v2 package is passed in, since Jest and tsx load it differently, and
 * so is the list the doubles' listener fills with the requests they could
 * not answer ("I/O")
 */
export const createRunner = (
  v2: typeof V2,
  io: { v2: V2Io; v3: V3Io },
  reviewed: Record<number, string>,
  unanswered: string[]
): Runner => {
  const notes = new Set<string>()
  // One v3 evaluator per options object: the corpus shares its options
  // objects, so most cases share one, and its result cache is cleared
  // before each case, as v2's evaluator is new for each
  type Built = { setup: V3Setup; fig: FigTree }
  const evaluators = new Map<unknown, Built>()
  const evaluator = (entry: Case): Built => {
    let built = evaluators.get(entry.options)
    if (built === undefined) {
      const setup = toV3Options(entry, io.v3)
      setup.notes.forEach((note) => notes.add(note))
      built = { setup, fig: new FigTree(setup.options) }
      evaluators.set(entry.options, built)
    }
    return built
  }

  const run = async (entry: Case): Promise<CaseResult> => {
    const heard: SentRequest[] = []
    onSent((request) => heard.push(request))
    try {
      return await compare(entry, heard)
    } finally {
      onSent(undefined)
    }
  }

  const compare = async (entry: Case, heard: SentRequest[]): Promise<CaseResult> => {
    const { setup, fig } = evaluator(entry)
    unanswered.length = 0
    const v2Outcome = await runV2(
      v2,
      { ...entry, expression: structuredClone(entry.expression) },
      io.v2
    )
    const v2Requests = heard.splice(0).map(describeRequest)
    // v2's requests are the corpus's: one no double answers means the
    // doubles or the corpus are wrong, and a failure in both engines alike
    // would pass for a match, so it stops the run
    if (unanswered.length > 0)
      throw new Error(
        `#${entry.id} ${entry.from}: v2 made a request no double answers: ${unanswered.join('; ')}`
      )
    const conversion = migrateV2Expression(entry.expression, converterOptions(entry))
    const called = calledFragments(conversion.expression, setup.options.fragments ?? {})
    const issues = [
      ...conversion.issues,
      ...setup.fragmentIssues.filter((issue) => called.has(String(issue.path[0]))),
    ]
    let v3Outcome: Outcome
    fig.clearCache()
    try {
      v3Outcome = { value: await fig.evaluate(conversion.expression) }
    } catch (error) {
      v3Outcome = { error: String((error as Error)?.message ?? error) }
    }
    // A request only v3 made is the conversion's doing: it fails v3's
    // outcome, which compares as usual
    const lost = unanswered.splice(0)
    const v3Requests = heard.splice(0).map(describeRequest)
    const note = reviewed[entry.id]
    const status: Status = sameResult(v2Outcome, v3Outcome)
      ? '✓'
      : issues.length > 0 || note !== undefined
        ? '⚠'
        : '✗'
    return {
      entry,
      converted: conversion.expression,
      issues,
      v2: v2Outcome,
      v3: v3Outcome,
      status,
      ...(status === '⚠' && note !== undefined ? { note } : {}),
      ...(lost.length > 0 ? { unanswered: lost } : {}),
      ...(v2Requests.length > 0 || v3Requests.length > 0
        ? {
            requests: {
              v2: v2Requests,
              v3: v3Requests,
              same: sameRequests(v2Requests, v3Requests),
            },
          }
        : {}),
    }
  }

  return { run, notes }
}

/**
 * The fragments a converted expression calls, directly or through another
 * fragment's body: the converter writes each call as
 * `{ fragment: name, … }`
 */
const calledFragments = (
  expression: unknown,
  fragments: Record<string, { expression?: unknown }>
) => {
  const called = new Set<string>()
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (value === null || typeof value !== 'object') return
    const { fragment } = value as { fragment?: unknown }
    if (typeof fragment === 'string' && !called.has(fragment)) {
      called.add(fragment)
      walk(fragments[fragment]?.expression)
    }
    Object.values(value).forEach(walk)
  }
  walk(expression)
  return called
}
