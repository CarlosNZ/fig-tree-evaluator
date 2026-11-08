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
 * themes (ec.config.mjs) and the playground's editor pane (`--fds-code-*`),
 * and the callouts' colours (`--fds-callout-*`, mapped onto Starlight's
 * asides in custom.css).
 *
 * astro.config.mjs puts `paletteCss()` in every page's head, and
 * ec.config.mjs builds the code themes with `codeTheme`.
 *
 * TO-DO: choose between Blue and Green before release, then delete the
 * other candidate and the `PALETTE` switch.
 */

/** @type {keyof typeof specs} */
export const PALETTE = 'green'

/**
 * @typedef {object} Syntax
 * @property {string} text
 * @property {string} key       object keys
 * @property {string} string
 * @property {string} number
 * @property {string} literal   booleans, null
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
 * @property {Record<CalloutKind | 'why', Callout>} callouts
 *
 * @typedef {{ bg: string, border: string, title: string }} Callout
 * @typedef {'note' | 'tip' | 'caution' | 'danger'} CalloutKind
 *
 * @typedef {{ dark: Mode, light: Mode }} Palette
 *
 * @typedef {object} Spec
 * @property {{ h: number, c: number }} gray    the surfaces' hue and chroma
 * @property {{ h: number, c: number }} accent
 * @property {Record<SyntaxRole, number>} syntax  a hue per role
 * @property {Partial<Record<SyntaxRole, { L: number, h: number }>>} [lightSyntax]
 *   a light-mode lightness and hue for a role whose colour would come out
 *   dull on the shared ladder: a dark amber is out of sRGB's reach, and its
 *   chroma is cut until it fits
 * @property {Record<CalloutKind, number>} callout  a hue per callout kind; `why`
 *   is drawn in the greys
 *
 * @typedef {'key' | 'string' | 'number' | 'literal' | 'keyword' | 'fn' | 'type'} SyntaxRole
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

/**
 * Each callout kind's lightness and chroma, as [L, C], for its tint, border
 * and title; the hue comes from the palette, unless a third number gives one
 * of its own. Note and tip are quiet: a faint tint, a title that stands out
 * against it. The warnings have a more saturated border and title over a
 * tint that stays soft. A red that is too saturated, or too light, reads as
 * pink, which sets danger's limits. Light caution's tint leans yellow, since
 * at its hue so pale a tint is close to danger's.
 */
const quietCallout = {
  dark: { bg: [0.27, 0.035], border: [0.68, 0.12], title: [0.82, 0.09] },
  light: { bg: [0.95, 0.025], border: [0.62, 0.13], title: [0.45, 0.12] },
}
const calloutLadders = {
  dark: {
    note: quietCallout.dark,
    tip: quietCallout.dark,
    caution: { bg: [0.3, 0.03], border: [0.7, 0.14], title: [0.76, 0.15] },
    danger: { bg: [0.3, 0.03], border: [0.64, 0.19], title: [0.7, 0.18] },
  },
  light: {
    note: quietCallout.light,
    tip: quietCallout.light,
    caution: { bg: [0.955, 0.035, 70], border: [0.66, 0.19], title: [0.58, 0.2] },
    danger: { bg: [0.95, 0.04], border: [0.6, 0.21], title: [0.52, 0.2] },
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
      ? [oklch(0.33, A.c * 0.45, A.h), oklch(0.765, A.c, A.h), oklch(0.8, A.c, A.h)]
      : [oklch(0.925, A.c * 0.28, A.h), oklch(0.47, A.c * 0.9, A.h), oklch(0.4, A.c * 0.8, A.h)]
  )
  const sL = dark ? 0.78 : 0.47
  const sC = dark ? 0.12 : 0.13
  const syntax = (/** @type {SyntaxRole} */ role) => {
    const override = dark ? undefined : spec.lightSyntax?.[role]
    return override ? oklch(override.L, sC, override.h) : oklch(sL, sC, spec.syntax[role])
  }
  const callout = (/** @type {CalloutKind} */ kind) => {
    const { bg, border, title } = calloutLadders[type][kind]
    const at = (/** @type {number[]} */ [L, C, h = spec.callout[kind]]) => oklch(L, C, h)
    return { bg: at(bg), border: at(border), title: at(title) }
  }
  return {
    grays,
    accent,
    current: { bg: accent[0], text: accent[2] },
    code: {
      text: grays[1],
      key: syntax('key'),
      string: syntax('string'),
      number: syntax('number'),
      literal: syntax('literal'),
      keyword: syntax('keyword'),
      fn: syntax('fn'),
      type: syntax('type'),
      comment: gray(dark ? 0.66 : 0.51, 0.8),
      punct: gray(dark ? 0.74 : 0.44, 0.6),
    },
    callouts: {
      note: callout('note'),
      tip: callout('tip'),
      caution: callout('caution'),
      danger: callout('danger'),
      why: { bg: grays[6], border: grays[4], title: grays[2] },
    },
  }
}

/** @satisfies {Record<string, Spec>} */
const specs = {
  // Slate greys with a clear, mid-strength blue
  blue: {
    gray: { h: 252, c: 0.028 },
    accent: { h: 250, c: 0.15 },
    syntax: { key: 250, string: 150, number: 30, literal: 30, keyword: 305, fn: 210, type: 85 },
    callout: { note: 250, tip: 300, caution: 50, danger: 30 },
  },
  // The logo's green (#3b6c34 at the light accent's lightness), over faintly
  // sage greys
  green: {
    gray: { h: 140, c: 0.015 },
    accent: { h: 140, c: 0.115 },
    syntax: { key: 240, string: 70, number: 300, literal: 30, keyword: 345, fn: 285, type: 195 },
    // Light strings as a burnt orange, since amber at the ladder's lightness
    // is brown
    lightSyntax: { string: { L: 0.52, h: 55 } },
    // Tips in the accent's green
    callout: { note: 245, tip: 140, caution: 50, danger: 30 },
  },
}

/** @type {Palette} */
export const palette = {
  dark: buildMode(specs[PALETTE], 'dark'),
  light: buildMode(specs[PALETTE], 'light'),
}

// ── CSS ───────────────────────────────────────────────────────────────────

/** @param {Mode} mode @param {boolean} light */
const modeVars = ({ grays, accent, current, code, callouts }, light) => {
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
    `--fds-code-number: ${code.number};`,
    `--fds-code-literal: ${code.literal};`,
    `--fds-code-comment: ${code.comment};`,
    `--fds-code-punct: ${code.punct};`,
    `--fds-selection: color-mix(in srgb, ${accent[1]} ${light ? 22 : 35}%, transparent);`,
    ...Object.entries(callouts).flatMap(([kind, { bg, border, title }]) => [
      `--fds-callout-${kind}-bg: ${bg};`,
      `--fds-callout-${kind}-border: ${border};`,
      `--fds-callout-${kind}-title: ${title};`,
    ]),
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
 * `dictionary.value` or an array. The grammar doesn't allow `$` in an
 * unquoted key, though JSON5 does, and scopes an operator key's `$` as an
 * illegal character before the key, so it is coloured as the key too. JSON5's
 * numbers are `constant.dec.numeric` and `constant.hex.numeric`, which
 * `constant.numeric` doesn't match.
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
        'meta.structure.dictionary.json5 > invalid.illegal.expected-dictionary-separator',
        'meta.object-literal.key',
        'support.type.property-name',
      ],
      c.key,
    ],
    [['constant', 'constant.language'], c.literal],
    [['constant.numeric', 'constant.dec.numeric', 'constant.hex.numeric'], c.number],
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
