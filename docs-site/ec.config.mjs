// @ts-check
import { readFileSync } from 'node:fs'
import { defineEcConfig, ExpressiveCodeTheme } from '@astrojs/starlight/expressive-code'
import ecTwoSlash from 'expressive-code-twoslash'
import { codeTheme } from './src/styles/palettes.mjs'

export default defineEcConfig({
  // The site palette's syntax colours, a theme per mode
  themes: [new ExpressiveCodeTheme(codeTheme('dark')), new ExpressiveCodeTheme(codeTheme('light'))],
  // Frames, tabs and backgrounds follow Starlight's colour variables
  useStarlightUiThemeColors: true,
  // The palette's syntax colours already reach 4.5:1 on their own code
  // background, so Expressive Code mustn't shift them
  minSyntaxHighlightingColorContrast: 0,
  // Long lines wrap rather than scroll, each continuation indented two
  // columns past its line's own indent so it reads as one line
  defaultProps: { wrap: true, hangingIndent: 2 },
  plugins: [
    // Every ts and tsx block is compiled, unless its meta says `nocheck`
    // (a fragment that can't compile). Each one is type-checked against
    // fig-tree-evaluator's real declarations, and the build fails on any
    // error the block doesn't declare with `// @errors`. Each snippet's
    // program also has the globals in twoslash/globals.d.ts.
    ecTwoSlash({
      tsConfigPath: './tsconfig.twoslash.json',
      instanceConfigs: { twoslash: { explicitTrigger: /^(?!.*\bnocheck\b)/ } },
      twoslashOptions: {
        extraFiles: {
          // From the working directory, as `tsConfigPath` is: this file is
          // bundled elsewhere for rendering, so its own URL doesn't lead here
          'globals.d.ts': readFileSync('./twoslash/globals.d.ts', 'utf8'),
        },
      },
    }),
    // A `// ---cut-after---` line is cut from its own start, so the line
    // break before it survives as an empty last line. Runs after twoslash
    // has replaced the block's text in preprocessCode
    {
      name: 'trim-trailing-empty-line',
      hooks: {
        postprocessAnalyzedCode({ codeBlock }) {
          const lines = codeBlock.getLines()
          const last = lines.length - 1
          if (last > 0 && lines[last].text.trim() === '') codeBlock.deleteLine(last)
        },
      },
    },
  ],
})
