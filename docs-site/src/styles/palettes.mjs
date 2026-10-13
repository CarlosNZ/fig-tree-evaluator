// @ts-check
/**
 * The site's colour palette, one of the candidates below, picked by
 * `PALETTE` at build time.
 *
 * Each palette is a few OKLCH choices (a hue and chroma for the greys and
 * the accent, a hue per syntax role) placed on lightness ladders shared by
 * every palette. The dark and light ladders mirror each other, so the two
 * modes sit at matching contrast: body text about 10:1 in both, muted text
 * about 5.5:1, rather than a stark light mode beside a soft dark one. The
 * light mode's page is an off-white and its text a softened near-black; the
 * dark mode's surfaces carry some of the palette's hue.
 *
 * The output sets, per mode, Starlight's grey scale and accent (the
 * variables its whole UI is drawn from), the current page's highlight, and
 * the syntax colours, which feed both the code blocks' Expressive Code
 * themes (ec.config.mjs) and the playground's editor pane (`--fds-code-*`).
 *
 * astro.config.mjs puts `paletteCss()` in every page's head, and
 * ec.config.mjs builds the code themes with `codeTheme`.
 *
 * TO-DO: choose between Blue and Green before release, then delete the
 * other candidate and the `PALETTE` switch.
 */

/** @type {keyof typeof specs} */
export const PALETTE = 'blue'

/**
 * @typedef {object} Syntax
 * @property {string} text
 * @property {string} key       object keys
 * @property {string} string
 * @property {string} literal   numbers, booleans, null
 * @property {string} keyword
 * @property {string} fn        function names
 * @property {string} type
 * @property {string} comment
 * @property {string} punct
 *
 * @typedef {object} Mode
 * @property {string[]} grays  white, gray-1 … gray-6 (gray-7 in light), black
 * @property {[string, string, string]} accent  low, accent, high
 * @property {{ bg: string, text: string }} current  the sidebar's current page
 * @property {Syntax} code
 *
 * @typedef {{ dark: Mode, light: Mode }} Palette
 *
 * @typedef {object} Spec
 * @property {{ h: number, c: number }} gray    the surfaces' hue and chroma
 * @property {{ h: number, c: number }} accent
 * @property {Record<'key' | 'string' | 'literal' | 'keyword' | 'fn' | 'type', number>} syntax
 *   a hue per role
 */

// ── OKLCH → sRGB hex ──────────────────────────────────────────────────────

/** @param {number} L @param {number} C @param {number} h */
const toLinearRgb = (L, C, h) => {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/**
 * The colour as hex, its chroma reduced until it fits in sRGB.
 * @param {number} L @param {number} C @param {number} h
 */
const oklch = (L, C, h) => {
  let rgb = toLinearRgb(L, C, h)
  while (rgb.some((v) => v < 0 || v > 1) && C > 0) {
    C = Math.max(0, C - 0.002)
    rgb = toLinearRgb(L, C, h)
  }
  return (
    '#' +
    rgb
      .map((v) => Math.min(1, Math.max(0, v)))
      .map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

// ── The ladders ───────────────────────────────────────────────────────────

/**
 * Lightness of white, gray-1 … gray-6 (… gray-7), black, and the share of
 * the palette's grey chroma each takes: surfaces carry the hue, text much
 * less of it. Dark: page .215, nav and code .255. Light: page .975, nav
 * and code .955.
 */
const ladders = {
  dark: {
    L: [0.97, 0.91, 0.84, 0.7, 0.5, 0.34, 0.255, 0.215],
    share: [0.25, 0.35, 0.45, 0.6, 0.8, 1, 1, 1],
  },
  light: {
    L: [0.24, 0.29, 0.355, 0.5, 0.7, 0.86, 0.925, 0.955, 0.975],
    share: [0.6, 0.6, 0.6, 0.6, 0.6, 0.5, 0.5, 0.5, 0.45],
  },
}

/** @param {Spec} spec @param {'dark' | 'light'} type @returns {Mode} */
const buildMode = (spec, type) => {
  const dark = type === 'dark'
  const { L, share } = ladders[type]
  const gray = (/** @type {number} */ l, /** @type {number} */ k) =>
    oklch(l, spec.gray.c * k, spec.gray.h)
  const grays = L.map((l, i) => gray(l, share[i]))
  const A = spec.accent
  // low, accent, high. Dark links are accent-high; light links are accent.
  const accent = /** @type {[string, string, string]} */ (
    dark
      ? [oklch(0.33, A.c * 0.45, A.h), oklch(0.68, A.c, A.h), oklch(0.8, A.c * 0.7, A.h)]
      : [oklch(0.925, A.c * 0.28, A.h), oklch(0.47, A.c * 0.9, A.h), oklch(0.4, A.c * 0.8, A.h)]
  )
  const sL = dark ? 0.78 : 0.47
  const sC = dark ? 0.12 : 0.13
  const s = spec.syntax
  return {
    grays,
    accent,
    current: { bg: accent[0], text: accent[2] },
    code: {
      text: grays[1],
      key: oklch(sL, sC, s.key),
      string: oklch(sL, sC, s.string),
      literal: oklch(sL, sC, s.literal),
      keyword: oklch(sL, sC, s.keyword),
      fn: oklch(sL, sC, s.fn),
      type: oklch(sL, sC, s.type),
      comment: gray(dark ? 0.66 : 0.51, 0.8),
      punct: gray(dark ? 0.74 : 0.44, 0.6),
    },
  }
}

/** @satisfies {Record<string, Spec>} */
const specs = {
  // Slate greys with a clear, mid-strength blue
  blue: {
    gray: { h: 252, c: 0.028 },
    accent: { h: 250, c: 0.15 },
    syntax: { key: 250, string: 150, literal: 30, keyword: 305, fn: 210, type: 85 },
  },
  // Sage greys with a jade green
  green: {
    gray: { h: 165, c: 0.022 },
    accent: { h: 160, c: 0.13 },
    syntax: { key: 165, string: 95, literal: 30, keyword: 320, fn: 235, type: 195 },
  },
}

/** @type {Palette} */
export const palette = {
  dark: buildMode(specs[PALETTE], 'dark'),
  light: buildMode(specs[PALETTE], 'light'),
}

// ── CSS ───────────────────────────────────────────────────────────────────

/** @param {Mode} mode @param {boolean} light */
const modeVars = ({ grays, accent, current, code }, light) => {
  const names = light
    ? ['white', 'gray-1', 'gray-2', 'gray-3', 'gray-4', 'gray-5', 'gray-6', 'gray-7', 'black']
    : ['white', 'gray-1', 'gray-2', 'gray-3', 'gray-4', 'gray-5', 'gray-6', 'black']
  return [
    ...names.map((name, i) => `--sl-color-${name}: ${grays[i]};`),
    `--sl-color-accent-low: ${accent[0]};`,
    `--sl-color-accent: ${accent[1]};`,
    `--sl-color-accent-high: ${accent[2]};`,
    `--fds-current-bg: ${current.bg};`,
    `--fds-current-text: ${current.text};`,
    `--fds-code-key: ${code.key};`,
    `--fds-code-string: ${code.string};`,
    `--fds-code-literal: ${code.literal};`,
    `--fds-code-comment: ${code.comment};`,
    `--fds-code-punct: ${code.punct};`,
    `--fds-selection: color-mix(in srgb, ${accent[1]} ${light ? 22 : 35}%, transparent);`,
  ].join(' ')
}

/**
 * The palette's variables for each mode, and the current page drawn as a
 * tint with accent text in both modes, where Starlight fills it with solid
 * accent. Unlayered, so it outranks Starlight's own layered values.
 */
export const paletteCss = () =>
  [
    `:root { ${modeVars(palette.dark, false)} }`,
    `:root[data-theme='light'] { ${modeVars(palette.light, true)} }`,
    `:root .sidebar-content [aria-current='page'] {` +
      ` background-color: var(--fds-current-bg); color: var(--fds-current-text); }`,
  ].join('\n')

/**
 * A VS Code-format theme for Expressive Code. The scopes cover the JSON5
 * grammar and TypeScript. JSON5 scopes an unquoted key `string.key`, but a
 * quoted one only `string.quoted`, which a value's string is too; a quoted
 * key's string is the dictionary's child, where a value's is nested in
 * `dictionary.value` or an array.
 *
 * @param {'dark' | 'light'} type
 */
export const codeTheme = (type) => {
  const mode = palette[type]
  const c = mode.code
  /** @type {[string[], string, string?][]} */
  const rules = [
    [['comment', 'punctuation.definition.comment'], c.comment, 'italic'],
    [['punctuation', 'keyword.operator', 'meta.brace'], c.punct],
    [['string', 'punctuation.definition.string'], c.string],
    [
      [
        'string.key',
        'meta.structure.dictionary.json5 > string.quoted',
        'meta.structure.dictionary.json5 > string.quoted > punctuation.definition.string',
        'meta.object-literal.key',
        'support.type.property-name',
      ],
      c.key,
    ],
    [['constant', 'constant.numeric', 'constant.language'], c.literal],
    [['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'], c.keyword],
    [['entity.name.function', 'support.function', 'meta.function-call'], c.fn],
    [['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], c.type],
    [['variable', 'variable.other', 'meta.definition.variable'], c.text],
  ]
  return {
    name: `fds-${type}`,
    type,
    colors: {
      'editor.background': type === 'dark' ? mode.grays[6] : mode.grays[7],
      'editor.foreground': c.text,
    },
    tokenColors: rules.map(([scope, foreground, fontStyle]) => ({
      scope,
      settings: fontStyle ? { foreground, fontStyle } : { foreground },
    })),
  }
}
