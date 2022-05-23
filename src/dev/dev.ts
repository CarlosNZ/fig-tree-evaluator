import fetch from 'node-fetch'
import { Client } from 'pg'
import ExpressionEvaluator from '../evaluator'
import evaluateExpression from '../evaluateExpression'
import pgConfig from '../test/postgres/pgConfig.json'

const pgConnect = new Client(pgConfig)

pgConnect.connect()

const exp = new ExpressionEvaluator({
  APIfetch: fetch,
  pgConnection: pgConnect,
  graphQLConnection: {
    fetch: fetch,
    endpoint: 'https://countries.trevorblades.com/',
  },
  objects: {
    randomWords: ['starfield', 'spaceships', 'planetary', ['DEATH STAR']],
    organisation: 'Galactic Empire',
    longSentence: {
      '🇨🇺': "Rebel spies managed to steal secret plans to the Empire's ultimate weapon",
    },
    functions: { getPrincess: (name: string) => `Princess ${name}` },
    Oceania: { NZ: { Wellington: 'stolen plans that can save her people' } },
  },
})

const expression = `{"operator":"gql","query":"query capitals($code:String!) {countries(filter: {code: {eq: $code}}) {capital}}","endpoint":"https://countries.trevorblades.com/","variables":{"code":"NZ"},"returnNode":"countries"}`

exp
  .evaluate(expression, {
    allowJSONStringInput: true,
    // returnErrorAsString: true,
  })
  .then((res) => console.log(res))
// .then(() => pgConnect.end())
