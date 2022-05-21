import evaluateExpression from '../evaluateExpression'
import { ExpressionEvaluator } from '../Evaluator'

const exp = new ExpressionEvaluator({})

evaluateExpression({
  operator: 'stringSubstitution',
  children: [
    'We have %1 %2 listed with an average value of %3: %4',
    2,
    'people',
    4.53,
    { value: ['Boba', 'Mando'] },
  ],
}).then((res) => console.log(res))
