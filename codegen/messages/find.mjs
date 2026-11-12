/**
 * The library's message strings: every string in src/ that reads as prose,
 * found in the source text. Shared by the Jest transform, which wraps each
 * one to record what it produces (transform.mjs), and by `pnpm messages`,
 * which lists them all (index.ts), so the two agree on each string's id.
 *
 * A message is a string literal, a template literal, or a `+` chain with a
 * string in it, whose fixed text holds two words in a row. A chain counts
 * as one message, its parts not separately; a template's holes are
 * searched for messages of their own, which nest inside it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

export const ROOT = join(import.meta.dirname, '..', '..')

/**
 * Where the strings are not the library's own wording: the catalog's
 * presentation text, the playground, and generated tables.
 */
const EXCLUDED = [/^src\/catalog\//, /^src\/dev\//, /\.generated\.ts$/, /^src\/version\.ts$/]

/**
 * A word followed by another, or by a quoted token, in the fixed text:
 * prose rather than a name or key
 */
const PROSE = /[a-z]{2,}[,:;]? +(?:[a-z']{2,}|["'`‘])/i

/** Separates a template's fixed parts, so no space appears between them */
const HOLE = '\u0000'

/** The repo-relative path of a src/ file, with forward slashes */
export const repoPath = (file) => relative(ROOT, file).split(sep).join('/')

/** Whether a file's strings are listed: a .ts file under src/, not excluded */
export const isMessageFile = (path) =>
  /^src\/.*\.ts$/.test(path) && !path.endsWith('.d.ts') && !EXCLUDED.some((re) => re.test(path))

/** Every listed file under src/, as repo-relative paths */
export const messageFiles = () =>
  readdirSync(join(ROOT, 'src'), { recursive: true })
    .map((name) => `src/${String(name).split(sep).join('/')}`)
    .filter(isMessageFile)
    .sort()

const isPlus = (node) =>
  ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken

const isStringy = (node) =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateExpression(node)

/** A `+` chain's operands, left to right */
const operands = (node) =>
  isPlus(node) ? [...operands(node.left), ...operands(node.right)] : [node]

/**
 * A string-valued node's fixed text, its holes marked, and how it reads:
 * fixed text as written, each hole as `${source}`.
 */
const textOf = (node, source) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { fixed: node.text, template: node.text }
  if (ts.isTemplateExpression(node)) {
    const spans = node.templateSpans
    return {
      fixed: [node.head.text, ...spans.map((span) => span.literal.text)].join(HOLE),
      template:
        node.head.text +
        spans.map((span) => `\${${span.expression.getText(source)}}${span.literal.text}`).join(''),
    }
  }
  if (isPlus(node)) {
    const parts = operands(node).map((part) =>
      isStringy(part)
        ? textOf(part, source)
        : { fixed: HOLE, template: `\${${part.getText(source)}}` }
    )
    return {
      fixed: parts.map((part) => part.fixed).join(''),
      template: parts.map((part) => part.template).join(''),
    }
  }
  return undefined
}

/** Positions where a string is not an expression, so cannot be wrapped */
const isFixedPosition = (node) => {
  const parent = node.parent
  if (!parent) return false
  if (parent.name === node) return true
  if (ts.isTaggedTemplateExpression(parent)) return true
  if (ts.isEnumMember(parent)) return true
  return false
}

/**
 * The messages in one file's source text, in source order: each with its
 * id (`file:line:column`), its line, its span in the text, and how it
 * reads. A message inside another's hole comes after it.
 */
export const findMessages = (text, path) => {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const found = []
  const record = (node, template) => {
    const start = node.getStart(source)
    const { line, character } = source.getLineAndCharacterOfPosition(start)
    found.push({
      id: `${path}:${line + 1}:${character + 1}`,
      file: path,
      line: line + 1,
      start,
      end: node.end,
      template,
    })
  }
  const visit = (node) => {
    if (
      ts.isLiteralTypeNode(node) ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isImportTypeNode(node) ||
      ts.isTypeNode(node)
    )
      return
    // The top of a chain: one message for the whole of it
    if (isPlus(node) && !isPlus(node.parent) && operands(node).some(isStringy)) {
      const { fixed, template } = textOf(node, source)
      if (PROSE.test(fixed)) record(node, template)
      for (const part of operands(node))
        if (isStringy(part)) ts.forEachChild(part, visit)
        else visit(part)
      return
    }
    if (isStringy(node) && !isFixedPosition(node)) {
      const { fixed, template } = textOf(node, source)
      if (PROSE.test(fixed)) record(node, template)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** Every message in every listed file */
export const allMessages = () =>
  messageFiles().flatMap((path) => findMessages(readFileSync(join(ROOT, path), 'utf8'), path))
