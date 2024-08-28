export const defaultBlurb = `
<img src="https://raw.githubusercontent.com/CarlosNZ/fig-tree-evaluator/main/images/FigTreeEvaluator_logo_1000.png" width="250" />

# Welcome to the FigTree Playground

**FigTree Evaluator** is a Javascript module to evaluate JSON-structured expression trees. 

A typical use case is for evaluating **configuration** files, where you need to store dynamic values or arbitrary logic without allowing users to inject executable code (perhaps in a .json file). E.g. a [form-builder app](https://github.com/openmsupply/conforma-web-app), or to enhance the dynamic logic of existing tools such as [JSON Forms](https://jsonforms.io).

Have a play with this demo to see the range of different operators, and how they can be built into powerful, complex expressions. Or use this site to build and test your own expressions.

Click on any operator "button" to evaluate the expression at that level, and edit either individual nodes using the GUI, or via the JSON text editor.

The expression builder featured here is a **React** component — it's essentially just a wrapper for [json-edit-react](https://carlosnz.github.io/json-edit-react/) but with additional [Custom Nodes](https://github.com/CarlosNZ/json-edit-react?tab=readme-ov-file#custom-nodes), so check out that project for some usage tips and examples.

<!---The expression builder is available to use in your own projects at: ...--> 

- [FigTree documentation](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#fig-tree-evaluator)
- [NPM Package](https://www.npmjs.com/package/fig-tree-evaluator)
- **Expression builder** (coming soon...)
`
