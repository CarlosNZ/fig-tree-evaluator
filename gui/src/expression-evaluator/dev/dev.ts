import evaluateExpression from '../evaluateExpression'
import { ExpressionEvaluator } from '../Evaluator'

const exp = new ExpressionEvaluator({})

const x = 10 * Math.random()

exp
  .evaluate(
    {
      operator: 'objectProperties',
      property: 'user.name',
    },
    { objects: { user: { name: 'Carl Smith' } } }
  )
  .then((res) => console.log(res))
  .catch((err) => console.log(err.message))
