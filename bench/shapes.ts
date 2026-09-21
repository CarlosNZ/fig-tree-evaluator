/**
 * The shared corpus shape for the v2-vs-v3 benches: a form config of
 * mostly-static sections, a few of which carry a visibility expression.
 * This is the Conforma shape the parse-cache measurements were sized
 * against (docs-dev/v3-specs/v3-implementation-notes.md), and the one the
 * O(holes) claim is about.
 *
 * The same logic is spelled once per engine. Neither spelling is ever
 * modified by a bench — a bench varies how many sections the config has
 * and how many of them carry the expression, nothing else.
 */

/** `user.isAdmin && stage !== 'draft'` — v3 shorthand. */
export const holeV3 = { $and: ['$data.user.isAdmin', { $notEqual: ['$data.stage', 'draft'] }] }

/** The same, in canonical v2. */
export const holeV2 = {
  operator: 'and',
  values: [
    { operator: 'objectProperties', property: 'user.isAdmin' },
    {
      operator: 'notEqual',
      values: [{ operator: 'objectProperties', property: 'stage' }, 'draft'],
    },
  ],
}

/**
 * Holes are spread evenly across the section list rather than bunched at
 * the front — position is irrelevant to both engines here, but bunching
 * would quietly turn a bulk sweep into a measurement of v3's constancy
 * probe bailing out early, which is a different claim.
 */
export const config = (sections: number, holes: number, hole: unknown) => {
  const holeAt = new Set(
    Array.from({ length: holes }, (_, h) => Math.floor((h * sections) / holes))
  )
  return {
    title: 'Application form',
    sections: Array.from({ length: sections }, (_, i) => ({
      code: `section${i}`,
      title: `Section ${i}`,
      index: i,
      enabled: true,
      description: 'Some static descriptive text that sits in the config unchanged.',
      visible: holeAt.has(i) ? hole : true,
    })),
  }
}

/** Fresh data every iteration, so no result can be reused by either side. */
export const data = (i: number) => ({
  user: { isAdmin: i % 2 === 0 },
  stage: i % 3 === 0 ? 'draft' : 'live',
})
