import { useEffect, useId, useRef, useState } from 'react'
import type { CoverageFinding, FallbackCoverage } from 'fig-tree-evaluator'
import { CardLines, HoverCard, type CardLine } from 'fig-tree-editor-react'

type Path = (string | number)[]

export interface CoverageBadgeProps {
  coverage: FallbackCoverage | null
  /** Opens the tree to a finding's node and scrolls it into view. */
  onReveal: (path: Path) => void
}

/**
 * Whether the expression is fully covered: nothing in it can fail without a
 * fallback to catch it (useFallbackCoverage.ts). Hovering it shows a summary,
 * and clicking it opens a panel listing each failure nothing catches, which
 * scrolls if it's long; clicking a failure shows its node in the tree. The
 * panel closes on a second click, on Escape, or on a click outside it.
 * Nothing shows while there's no coverage, as while the expression has
 * errors.
 */
export default function CoverageBadge({ coverage, onReveal }: CoverageBadgeProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  // Listening only while the panel is open, for what closes it
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (coverage === null) return null
  const { uncovered } = coverage
  const covered = uncovered.length === 0
  return (
    <div className="fds-coverage-badge" ref={root} data-open={open || undefined}>
      {/*
        The summary card is always given, so the button keeps its place in
        the tree, and keeps focus, as the panel opens and closes; the CSS
        hides it while the panel, which starts with it, is open
      */}
      <HoverCard align="end" card={<CardLines titled lines={summarise(uncovered.length)} />}>
        <button
          ref={button}
          className={`fds-coverage-badge-label fds-coverage-badge-label--${covered ? 'covered' : 'uncovered'}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          {covered ? '✓ Fully covered' : `✗ ${uncovered.length} uncovered`}
        </button>
      </HoverCard>
      {open && (
        <div
          id={panelId}
          className="ft-hover-card fds-coverage-panel"
          role="region"
          aria-label="Coverage"
        >
          <CardLines titled lines={summarise(uncovered.length)} />
          {uncovered.length > 0 && (
            <div className="fds-coverage-findings">
              <CardLines titled lines={[`Uncaught (${uncovered.length})`]} />
              {uncovered.map((finding, index) => (
                <button
                  key={index}
                  className="fds-coverage-finding"
                  title="Show in the tree"
                  onClick={() => onReveal(finding.path)}
                >
                  <CardLines lines={describe(finding)} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const summarise = (uncovered: number) =>
  uncovered > 0
    ? [
        'May throw',
        `${plural(uncovered, 'failure')} with no fallback to catch ${uncovered === 1 ? 'it' : 'them'}`,
      ]
    : ['Always returns a value', 'Nothing can fail without a fallback to catch it']

/** A finding's headline, where it starts and its code, with its other fields as details under it. */
const describe = ({
  path,
  code,
  message,
  certainty,
  operator,
  parameter,
  fragment,
  fragmentPath,
}: CoverageFinding): CardLine[] => {
  const details: CardLine[] = [{ detail: `${message} (${certainty})` }]
  if (operator !== undefined || parameter !== undefined)
    details.push({
      detail: [operator && `operator \`${operator}\``, parameter && `parameter \`${parameter}\``]
        .filter(Boolean)
        .join(', '),
    })
  if (fragment !== undefined)
    details.push({
      detail: `in fragment \`${fragment}\`${fragmentPath ? ` at \`${showPath(fragmentPath)}\`` : ''}`,
    })
  return [`\`${showPath(path)}\` · \`${code}\``, ...details]
}

const showPath = (path: Path) => (path.length === 0 ? 'root' : path.join('.'))

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
