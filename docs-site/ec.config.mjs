// @ts-check
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
  plugins: [
    // Only blocks whose meta says `twoslash` are compiled. Each one is
    // type-checked against fig-tree-evaluator's real declarations, and the
    // build fails on any error the block doesn't declare with `// @errors`.
    ecTwoSlash({ tsConfigPath: './tsconfig.twoslash.json' }),
  ],
})
