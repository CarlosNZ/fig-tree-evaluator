/**
 * The site's colours for the tree editors: the docs widget's FigTree editor,
 * and the Playground page's data and expression editors. All of them are CSS
 * variables (custom.css), so the editors follow the site's light and dark
 * themes.
 */

/** The FigTree editor's own colours that need a dark-mode variant. */
export const editorColours = {
  refData: 'var(--fds-tree-ref-data)',
  refVars: 'var(--fds-tree-ref-vars)',
  refParams: 'var(--fds-tree-ref-params)',
}

/**
 * The site's layer of json-edit-react's theme. Its container is transparent,
 * so the docs' CSS sets the pane's background, and its padding lines its
 * first row up with the code pane's first line.
 */
export const editorStyles = {
  container: { backgroundColor: 'transparent', padding: '0.1em 0.5em 1em 1.5em' },
  property: 'var(--fds-code-key)',
  string: 'var(--fds-tree-string)',
  input: 'var(--fds-tree-input)',
  inputHighlight: 'var(--fds-tree-highlight)',
  bracket: 'var(--fds-tree-bracket)',
  itemCount: 'var(--fds-tree-item-count)',
  iconCollection: 'var(--fds-tree-chevron)',
}
