### AND

operator: "AND" / "and", "&", "&&"
children / values:

### OR
`
operator: "|", "||", "or",

### =

operator: "=", "eq", "equals", "equal"


### !=

operator: "!=", "!", "ne", "notEqual"

### +

operator: "+", "plus", "add", "concat", "join", "merge"

### ?

Properties:
- condition
- valueIfTrue
- valueIfFalse

### REGEX

Properties:
- pattern
- testString

### objectProperties

Properties:
- property


### stringSubstitution

Properties:
- string
- substitutions: []


### pgSQL

Properties:
- query
- values

### graphQL

Properties:
- query
- url
- variables: {key: value}
- return / output / returnNode / outputNode

### GET / POST

Properties:
- url
- variables / parameters / queryParams
- return / output / returnProp / outputProp

### buildObject

### objectFunctions

Properties:
- functionPath
- args