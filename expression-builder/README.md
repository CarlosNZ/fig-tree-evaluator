# fig-tree-builder-react

### [Demo/Playground](https://carlosnz.github.io/fig-tree-evaluator/)

A [React](https://github.com/facebook/react) component for constructing and editing [**FigTreeEvaluator**](https://github.com/CarlosNZ/fig-tree-evaluator) expressions.

<!-- TO-DO: Screenshot -->

It's built on [**json-edit-react**](https://carlosnz.github.io/json-edit-react/) (a JSON/object data viewer/editor), so usage is basically the same as for that component. The main addition is the use of [Custom Nodes](https://github.com/CarlosNZ/json-edit-react?tab=readme-ov-file#custom-nodes) to handle the specifics of FigTree expression, providing validation and custom UI to select and manipulate the various [operators](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#operator-reference).

<!-- Installation -->

<!-- Implementation -->

The majority of props are those for json-edit-react, so won't be covered here. The only ones specific to this component are:

<!-- PROPS -->