// @ts-check
import { defineEcConfig } from '@astrojs/starlight/expressive-code'
import ecTwoSlash from 'expressive-code-twoslash'

export default defineEcConfig({
  plugins: [
    // Only blocks whose meta says `twoslash` are compiled. Each one is
    // type-checked against fig-tree-evaluator's real declarations, and the
    // build fails on any error the block doesn't declare with `// @errors`.
    ecTwoSlash({ tsConfigPath: './tsconfig.twoslash.json' }),
  ],
})
