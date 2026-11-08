import { defineOperator } from 'fig-tree-evaluator'

const EARTH_RADIUS = { km: 6371, mi: 3959 }

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export const distance = defineOperator({
  name: 'distance',
  category: 'math',
  parameters: {
    // Each point is [latitude, longitude]
    from: { type: 'array', constraints: { length: 2, homogeneous: ['number'] } },
    to: { type: 'array', constraints: { length: 2, homogeneous: ['number'] } },
    unit: { type: { literal: ['km', 'mi'] }, default: 'km' },
  },
  positionalParams: ['from', 'to', 'unit'],
  returns: 'number',
  evaluate: ({ from, to, unit }) => {
    const [lat1, lon1] = (from as number[]).map(toRadians)
    const [lat2, lon2] = (to as number[]).map(toRadians)
    const a =
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
    return Math.round(2 * EARTH_RADIUS[unit] * Math.asin(Math.sqrt(a)))
  },
})
