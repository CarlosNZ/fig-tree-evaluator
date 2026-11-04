import type { CoverageFinding, FallbackCoverage } from 'fig-tree-evaluator'
import { CardLines, HoverCard, type CardLine } from 'fig-tree-editor-react'

/**
 * Whether the expression is fully covered: nothing in it can fail without a
 * fallback to catch it (useFallbackCoverage.ts). A card lists each failure
 * nothing catches. Nothing shows while there's no coverage, as while the
 * expression has errors.
 */
export default function CoverageBadge({ coverage }: { coverage: FallbackCoverage | null }) {
  if (coverage === null) return null
  const { uncovered } = coverage
  const covered = uncovered.length === 0
  return (
    <div className="fds-coverage-badge">
      <HoverCard
        align="end"
        card={
          <>
            <CardLines titled lines={summarise(uncovered.length)} />
            <FindingSection title="Uncaught" findings={uncovered} />
          </>
        }
      >
        <span
          className={`fds-coverage-badge-label fds-coverage-badge-label--${covered ? 'covered' : 'uncovered'}`}
          tabIndex={0}
        >
          {covered ? '✓ Fully covered' : `✗ ${uncovered.length} uncovered`}
        </span>
      </HoverCard>
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

const FindingSection = ({ title, findings }: { title: string; findings: CoverageFinding[] }) =>
  findings.length > 0 && (
    <span className="fds-coverage-findings">
      <CardLines titled lines={[`${title} (${findings.length})`, ...findings.flatMap(describe)]} />
    </span>
  )

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

const showPath = (path: (string | number)[]) => (path.length === 0 ? 'root' : path.join('.'))

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
