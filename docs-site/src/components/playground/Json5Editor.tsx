import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { Annotation, EditorState } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { json5, json5Language } from 'codemirror-json5'

/**
 * Colours from custom.css's `--fds-code-*` tokens, so the pane follows the
 * site's light and dark themes.
 */
const highlighting = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--fds-code-key)' },
  { tag: tags.string, color: 'var(--fds-code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--fds-code-literal)' },
  { tag: [tags.lineComment, tags.blockComment], color: 'var(--fds-code-comment)' },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: 'var(--fds-code-punct)' },
])

const theme = EditorView.theme({
  '&': { fontSize: 'var(--sl-text-code)', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--__sl-font-mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--sl-color-text)' },
  '.cm-gutters': {
    background: 'var(--sl-color-bg-inline-code)',
    color: 'var(--sl-color-gray-3)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'var(--fds-active-line)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--sl-color-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    background: 'var(--fds-selection) !important',
  },
})

/** Marks a write of the parent's `value`, which isn't reported back as an edit. */
const fromParent = Annotation.define<boolean>()

/** Whether JSON5 source holds a comment, read from the same grammar the pane uses. */
export const hasComments = (text: string): boolean => {
  let found = false
  json5Language.parser.parse(text).iterate({
    enter: (node) => {
      if (node.name === 'LineComment' || node.name === 'BlockComment') found = true
      return !found
    },
  })
  return found
}

interface Props {
  /** The pane's text. A value that differs from what the pane shows replaces it. */
  value: string
  onChange: (text: string) => void
  label: string
}

/**
 * A controlled CodeMirror pane. Typing reports each new text through
 * `onChange`; the parent echoes it back as `value`, which then matches the
 * document and changes nothing, so the cursor stays put. Only a `value` the
 * parent produced some other way is written into the document.
 */
export const Json5Editor = ({ value, onChange, label }: Props) => {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json5(),
          syntaxHighlighting(highlighting),
          theme,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            const echo = update.transactions.some((tr) => tr.annotation(fromParent))
            if (update.docChanged && !echo) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.current?.destroy()
    // The view is created once; later values arrive through the effect below
  }, [])

  useEffect(() => {
    const current = view.current
    if (!current || current.state.doc.toString() === value) return
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: value },
      annotations: fromParent.of(true),
    })
  }, [value])

  return <div className="fds-cm" ref={host} />
}
