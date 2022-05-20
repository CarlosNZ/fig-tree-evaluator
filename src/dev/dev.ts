import evaluateExpression from '../evaluateExpression'
import { ExpressionEvaluator } from '../Evaluator'

const exp = new ExpressionEvaluator({})

exp
  .evaluate(
    {
      operator: 'or',
      values: [true, false],
    },
    { objects: { user: { name: 'Carl Smith' } } }
  )
  .then((res) => console.log(res))
  .catch((err) => console.log(err.message))

evaluateExpression({ operator: '+', children: [1, 2, 3] }).then((res) => console.log(res))
