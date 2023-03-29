/*
Extracts the current version no. from package.json and writes it to version.ts so it can be accessed by the FigTree class.

This script should run automatically before build.
*/
import { writeFileSync } from 'fs'
import pkg from '../package.json'

console.log('Adding package version:', pkg.version)

writeFileSync('src/version.ts', `export const version = '${pkg.version}'`)
