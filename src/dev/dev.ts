import fetch from 'node-fetch'
import evaluateExpression from '../evaluateExpression'
import { ExpressionEvaluator } from '../Evaluator'

const exp = new ExpressionEvaluator({ APIfetch: fetch })

exp
  .evaluate({
    operator: 'post',
    children: [
      'https://jsonplaceholder.typicode.com/posts',
      ['title', 'body', 'userId'],
      'Episode IV: A New Hope',
      'It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire. During the battle, Rebel spies managed to steal secret plans to the Empire’s ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet...',
      2,
    ],
  })
  .then((res) => console.log(JSON.stringify(res)))
