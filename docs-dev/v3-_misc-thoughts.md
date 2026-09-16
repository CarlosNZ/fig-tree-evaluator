A place for author (@CarlosNZ) to make notes of things to remember to consider in the V3 development. Not to be edited by CLAUDE.

- String substitution should have a way to trim whitespace caused by empty subsitutions. For example:  
  ```
  {
    "$buildString": {
      "string": "My name is {{first}} {{last}}",
      "substitutions": {
        "first": "Carl",
        "last": null
      }
    }
  }
  ```  
  would normally return "My name is Carl .", due the space after the `{{first}}` sub. There should be an option to drop white space from *around* a substituted value if it's empty.