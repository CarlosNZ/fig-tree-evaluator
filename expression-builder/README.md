# fig-tree-builder-react

### [Demo/Playground](https://carlosnz.github.io/fig-tree-evaluator/)

A [React](https://github.com/facebook/react) component for constructing and editing [**FigTreeEvaluator**](https://github.com/CarlosNZ/fig-tree-evaluator) expressions.

<!-- TO-DO: Screenshot -->

It's built on [**json-edit-react**](https://carlosnz.github.io/json-edit-react/) (a JSON/object data viewer/editor), so usage is basically the same as for that component. The main addition is the use of [Custom Nodes](https://github.com/CarlosNZ/json-edit-react?tab=readme-ov-file#custom-nodes) to handle the specifics of FigTree expressions, providing validation and custom UI to select and manipulate the various [operators](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#operator-reference).

<!-- Add screenshot -->

<!-- Add basic info about what you can do -->

## Installation

`npm i fig-tree-builder-react`

or 

`yarn add fig-tree-builder-react`

## Implementation

```jsx
import { FigTreeEditor } from 'fig-tree-builder-react'

// In your React component:
return 
  <FigTreeEditor
    // These 3 props are required, the rest are optional
    figTree={figTree} // your FigTree instance
    expression={expressionObject} // your FigTree expression object
    setData={ (data) => updateMyExpression(data) } // function to update your expression object
    { ...otherProps } />
```

## Available props

The majority of props are those for [json-edit-react](https://carlosnz.github.io/json-edit-react/), so won't be covered here. The ones specific to this component are:

### Required

| Prop            | Type                                     | Default | Description                              |
| --------------- | ---------------------------------------- | ------- | ---------------------------------------- |
| `figTree`       | `FigTreeEvaluator`                       |         | A FigTree instance to run evaluations on |
| `expression`    | `EvaluatorNode`</br>(object/array/value) |         | The FigTree expression                   |
| `setExpression` | `(data: EvaluatorNode) => void`          |         | React state update function              |

### Optional

| Prop              | Type                       | Default | Description                                                                                                                                                          |
| ----------------- | -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `objectData`      | `object`                   |         | Data object accessed by FigTree's [`getData`/`objectProperties` operator](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#object_properties)       |  |
| `onEvaluate`      | `(value: unknown) => void` |         | Optional function to call on the evaluated result after clicking one of the "Evaluate" buttons. Can be used (for example) to display a Notification with the result. |
| `onEvaluateStart` | `() => void`               |         | Called when an "Evaluate" button is clicked. Some evaluations can take some time (e.g. network requests), so this can be used to trigger a "Loading" indicator.      |
| `operatorDisplay` | `Operator Display Data`    |         | Used to set the background and text colours for the various Operator "Evaluate" buttons. See [below] for details.                                                    |  |


### Operator Details

*-- TO-DO*
