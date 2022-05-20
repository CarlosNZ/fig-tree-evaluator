// Test suite for the evaluateExpression() function

import evaluateExpression from "../evaluateExpression";
import { testData } from "./evaluateExpressionTestData";
import config from "../config.json";
// import secrets from "../testSecrets.json";

const { Client } = require("pg");

// CONFIG -- Postgres DATABASE SETUP:
const pgConnect = new Client(config.pg_database_connection);

pgConnect.connect();

// CONFIG -- GraphQL SETUP
const fetch = require("node-fetch");
const graphQLendpoint = "http://localhost:5000/graphql";

// Basic (single level literals)

test("Testing basic string literal", () => {
  return evaluateExpression(testData.basicStringLiteral).then((result: any) => {
    expect(result).toBe("First Name");
  });
});

test("Testing basic string literal - no type", () => {
  return evaluateExpression(testData.basicStringLiteralNoType).then((result: any) => {
    expect(result).toBe("First Name");
  });
});

test("Testing basic boolean", () => {
  return evaluateExpression(testData.basicBoolean).then((result: any) => {
    expect(result).toBe(true);
  });
});

test("Testing basic Array", () => {
  return evaluateExpression(testData.basicArray).then((result: any) => {
    expect(result).toEqual(["Pharmaceutical", "Natural Product", "Other"]);
  });
});

// AND operator

test("Testing AND operator with 2 children", () => {
  return evaluateExpression(testData.operatorAND_2values).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Testing AND operator with 2 children, one false", () => {
  return evaluateExpression(testData.operatorAND_2values_false).then((result: any) => {
    expect(result).toEqual(false);
  });
});

test("Testing AND operator with 4 children", () => {
  return evaluateExpression(testData.operatorAND_4values).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Testing AND operator with 4 children, one false", () => {
  return evaluateExpression(testData.operatorAND_4values_false).then((result: any) => {
    expect(result).toEqual(false);
  });
});

// OR operator

test("Testing OR operator with 2 children", () => {
  return evaluateExpression(testData.operatorOR_2values).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Testing OR operator with 2 children, one false", () => {
  return evaluateExpression(testData.operatorOR_2values_1false).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Testing OR operator with 4 children", () => {
  return evaluateExpression(testData.operatorOR_4values).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Testing OR operator with 4 children, 1 false", () => {
  return evaluateExpression(testData.operatorOR_4values_1false).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Testing OR operator with 4 children, all false", () => {
  return evaluateExpression(testData.operatorOR_4values_false).then((result: any) => {
    expect(result).toEqual(false);
  });
});

// Equal (=) operator

test("Testing Equality (numbers)", () => {
  return evaluateExpression(testData.EQUAL_Numbers).then((result: any) => {
    expect(result).toBe(true);
  });
});

test("Testing Equality (numbers) -- don't match", () => {
  return evaluateExpression(testData.EQUAL_Numbers_false).then((result: any) => {
    expect(result).toBe(false);
  });
});

test("Testing Equality (strings)", () => {
  return evaluateExpression(testData.EQUAL_String).then((result: any) => {
    expect(result).toBe(true);
  });
});

test("Testing Equality (strings) -- don't match", () => {
  return evaluateExpression(testData.EQUAL_String_false).then((result: any) => {
    expect(result).toBe(false);
  });
});

test("Testing Equality (numbers) -- many", () => {
  return evaluateExpression(testData.EQUAL_Numbers_many).then((result: any) => {
    expect(result).toBe(true);
  });
});

test("Testing Equality (strings) -- single child", () => {
  return evaluateExpression(testData.EQUAL_String_single).then((result: any) => {
    expect(result).toBe(true);
  });
});

// Inequality

test("Testing Inequality (numbers)", () => {
  return evaluateExpression(testData.NOT_EQUAL_Numbers).then((result: any) => {
    expect(result).toBe(true);
  });
});

test("Testing Inequality (numbers) -- false", () => {
  return evaluateExpression(testData.NOT_EQUAL_Numbers_false).then((result: any) => {
    expect(result).toBe(false);
  });
});

test("Testing Inequality (strings)", () => {
  return evaluateExpression(testData.NOT_EQUAL_String).then((result: any) => {
    expect(result).toBe(true);
  });
});

test("Testing Inequality (strings) -- false", () => {
  return evaluateExpression(testData.NOT_EQUAL_String_false).then((result: any) => {
    expect(result).toBe(false);
  });
});

// PLUS (+) operator

test("Testing Adding 2 numbers", () => {
  return evaluateExpression(testData.PLUS_2Nums).then((result: any) => {
    expect(result).toBe(12);
  });
});

test("Testing Adding 4 numbers", () => {
  return evaluateExpression(testData.PLUS_4Nums).then((result: any) => {
    expect(result).toBe(38.6);
  });
});

test("Testing Array concatenation", () => {
  return evaluateExpression(testData.CONCAT_2_Arrays).then((result: any) => {
    expect(result).toEqual([1, 2, 3, "Four", "Five", "Six"]);
  });
});

test("Testing Array concatenation with 4 children, including nested array", () => {
  return evaluateExpression(testData.CONCAT_4_Arrays).then((result: any) => {
    expect(result).toEqual([1, 2, 3, "Four", "Five", "Six", 7, 8, "Nine", ["Four", "Five", "Six"], "The", "End"]);
  });
});

test("Testing String concatenation", () => {
  return evaluateExpression(testData.CONCAT_3_Strings).then((result: any) => {
    expect(result).toBe("Carl Smith");
  });
});

test("Testing String concatenation with type undefined", () => {
  return evaluateExpression(testData.CONCAT_4_Unspecified).then((result: any) => {
    expect(result).toBe("Carl Smith--XXX");
  });
});

test("Testing String concatenation output as Array", () => {
  return evaluateExpression(testData.CONCAT_strings_output_as_array).then((result: any) => {
    expect(result).toEqual(["One", "Two", "Three"]);
  });
});

test("Testing Merge 2 objects", () => {
  return evaluateExpression(testData.MERGE_2Objects).then((result: any) => {
    expect(result).toEqual({ one: 1, two: "2", three: false, four: [1, 2, 3], five: true });
  });
});

test("Testing Merge 3 objects", () => {
  return evaluateExpression(testData.MERGE_3Objects).then((result: any) => {
    expect(result).toEqual({
      one: 1,
      two: "2",
      three: undefined,
      four: [1, 2, 3],
      five: true,
      1: null,
      2: "TRUE",
    });
  });
});

// Conditional (?) operator

test("Basic conditional", () => {
  return evaluateExpression(testData.CONDITIONAL_basic).then((result: any) => {
    expect(result).toEqual("A");
  });
});

test("Conditional with Addition", () => {
  return evaluateExpression(testData.CONDITIONAL_with_addition).then((result: any) => {
    expect(result).toEqual("Correct");
  });
});

test("Conditional with Logical expression", () => {
  return evaluateExpression(testData.CONDITIONAL_logical_expression).then((result: any) => {
    expect(result).toEqual("Expression is True");
  });
});

test("Conditional with False Logical expression", () => {
  return evaluateExpression(testData.CONDITIONAL_logical_expression_false).then((result: any) => {
    expect(result).toEqual("Expression is False");
  });
});

// REGEX operator

test("Testing Regex - Email validation", () => {
  return evaluateExpression(testData.REGEX_check_email).then((result: any) => {
    expect(result).toBe(true);
  });
});

test("Testing Regex - Email validation", () => {
  return evaluateExpression(testData.REGEX_check_email_false).then((result: any) => {
    expect(result).toBe(false);
  });
});

// Return User or Form values

test("Test returning single user property", () => {
  return evaluateExpression(testData.singleUserProperty, { objects: { user: testData.user } }).then((result: any) => {
    expect(result).toBe("Carl");
  });
});

test("Test returning single application property, depth 2, no object index", () => {
  return evaluateExpression(testData.singleApplicationProperty_depth2, {
    objects: { application: testData.application },
  }).then((result: any) => {
    expect(result).toBe("Enter your name");
  });
});

test("Test unresolved object", async () => {
  try {
    await evaluateExpression(testData.objectPropertyUnresolved, {
      objects: { application: testData.application },
    });
  } catch (e) {
    expect(e.message).toMatch(
      /Unable to extract object property\nLooking for property: q5\nIn object: {\"q1\":\"What is the answer\?\",\"q2\":\"Enter your name\"}/
    );
  }
});

test("Test unresolved object with Null fallback", () => {
  return evaluateExpression(testData.objectPropertyUnresolvedWithNullFallback, {
    objects: { application: testData.application },
  }).then((result: any) => {
    expect(result).toBe(null);
  });
});

test("Test unresolved object with Null fallback, deep query", () => {
  return evaluateExpression(testData.objectPropertyUnresolvedDeepWithNullFallback, {
    objects: { application: testData.application },
  }).then((result: any) => {
    expect(result).toBe(null);
  });
});

// String substitution

test("Simple string substitution", () => {
  return evaluateExpression(testData.stringSubstitutionSingle).then((result: any) => {
    expect(result).toEqual("Hello, friend, welcome to our site.");
  });
});

test("Simple string substitution - multiple replacements", () => {
  return evaluateExpression(testData.stringSubstitutionMultiple).then((result: any) => {
    expect(result).toBe("There are 10 kinds of people in the world:\nthose who understand binary and those who don't");
  });
});

test("String substitution - non-string replacements", () => {
  return evaluateExpression(testData.stringSubstitutionNonStringReplacements).then((result: any) => {
    expect(result).toBe("We have 2 people listed with an average value of 4.53: Boba,Mando");
  });
});

test("String substitution - too many replacements", () => {
  return evaluateExpression(testData.stringSubstitutionTooManyReplacements).then((result: any) => {
    expect(result).toBe("The price of milk is $2.30 per liter");
  });
});

test("String substitution - too few replacements", () => {
  return evaluateExpression(testData.stringSubstitutionTooFewReplacements).then((result: any) => {
    expect(result).toBe("The applicant's name is Carl Smith .");
  });
});

test("String substitution - parameters not ordered", () => {
  return evaluateExpression(testData.stringSubstitutionParametersNonOrdered).then((result: any) => {
    expect(result).toBe("Two out of every 3 people are stupid");
  });
});

test("String substitution - parameters not ordered and too few", () => {
  return evaluateExpression(testData.stringSubstitutionParametersNonOrderedAndTooFew).then((result: any) => {
    expect(result).toBe("Two out of every  people are stupid");
  });
});

test("String substitution - parameters not sequential", () => {
  return evaluateExpression(testData.stringSubstitutionParametersNotSequential).then((result: any) => {
    expect(result).toBe(`It shouldn't matter if there are big gaps between parameter numbers`);
  });
});

test("String substitution - no parameters", () => {
  return evaluateExpression(testData.stringSubstitutionNoParameters).then((result: any) => {
    expect(result).toBe("This sentence has no replacements.");
  });
});

test("String substitution - no replacements supplied", () => {
  return evaluateExpression(testData.stringSubstitutionNoReplacements).then((result: any) => {
    expect(result).toBe("Your name is   but we have nothing to replace them with");
  });
});

test("String substitution - some parameters empty strings", () => {
  return evaluateExpression(testData.stringSubstitutionEmptyStringInReplacements).then((result: any) => {
    expect(result).toBe("You like: \\n-Cake\\n-Candy");
  });
});

test("String substitution - repeated parameters", () => {
  return evaluateExpression(testData.stringSubstitutionRepeatedParameters).then((result: any) => {
    expect(result).toBe("THIS is the same as THIS but not THAT");
  });
});

// GET operator
// test("GET: Check username is unique", () => {
//   return evaluateExpression(testData.APIisUnique, {
//     APIfetch: fetch,
//     headers: {
//       Authorization: secrets.nonRegisteredAuth,
//     },
//   }).then((result: any) => {
//     expect(result).toEqual({ unique: true, message: "" });
//   });
// });

// test("GET: Check username is unique using custom query authentication", () => {
//   return evaluateExpression(testData.APIisUniqueWithHeaders, {
//     objects: { secrets },
//     APIfetch: fetch,
//   }).then((result: any) => {
//     expect(result).toEqual({ unique: false, message: "" });
//   });
// });

test("GET: Lookup ToDo in online testing API", () => {
  return evaluateExpression(testData.onlineTestAPI, {
    APIfetch: fetch,
  }).then((result: any) => {
    expect(result).toBe("delectus aut autem");
  });
});

test("GET: Return an array from online API", () => {
  return evaluateExpression(testData.onlineArrayReturn, {
    APIfetch: fetch,
  }).then((result: any) => {
    expect(result).toEqual(testData.onlineArrayReturnResult);
  });
});

test("GET: Return an array of titles plucked from inside array of objects", () => {
  return evaluateExpression(testData.onlineArrayNodes, {
    APIfetch: fetch,
  }).then((result: any) => {
    expect(result).toEqual(testData.onlineArrayNodesResult);
  });
});

// POST operator
// test("POST: Check user login credentials", () => {
//   return evaluateExpression(testData.APIlogin, {
//     APIfetch: fetch,
//   }).then((result: any) => {
//     expect(result).toEqual(true);
//   });
// });

// SQL operator

// test("Test Postgres lookup single string", () => {
//   return evaluateExpression(testData.getApplicationName, { pgConnection: pgConnect }).then((result: any) => {
//     expect(result).toBe("Company License -- Modern medicines or Medical devices - S-GZY-0010");
//   });
// });

// test("Test Postgres get array of template names", () => {
//   return evaluateExpression(testData.getListOfTemplates, { pgConnection: pgConnect }).then((result: any) => {
//     expect(result).toEqual([
//       "User Registration",
//       "Edit User Details",
//       "Grant User Permissions",
//       "Add User to Company",
//       "Company License -- Modern medicines or Medical devices",
//     ]);
//   });
// });

// test("Test Postgres get Count of templates", () => {
//   return evaluateExpression(testData.countTemplates, { pgConnection: pgConnect }).then((result: any) => {
//     expect(result).toEqual(24);
//   });
// });

// test("Test Postgres get template names -- no type", () => {
//   return evaluateExpression(testData.getListOfTemplates_noType, { pgConnection: pgConnect }).then((result: any) => {
//     expect(result).toEqual([
//       { name: "User Registration" },
//       { name: "Edit User Details" },
//       { name: "Grant User Permissions" },
//       { name: "Add User to Company" },
//       { name: "Company License -- Modern medicines or Medical devices" },
//     ]);
//   });
// });

// test("Test Postgres get application list with IDs", () => {
//   return evaluateExpression(testData.getListOfApplications_withId, {
//     pgConnection: pgConnect,
//   }).then((result: any) => {
//     expect(result).toEqual([
//       { id: 18, name: "Company License -- Modern medicines or Medical devices - S-GZY-0010" },
//       { id: 22, name: "Company Registration - S-ECL-0011" },
//       { id: 23, name: "Product Registration - S-WJY-0006" },
//       { id: 26, name: "Company Registration - Pharma123" },
//       { id: 27, name: "Company Registration - Holistic Medicine AU" },
//     ]);
//   });
// });

// GraphQL operator

// test("Test GraphQL -- get single application name", () => {
//   return evaluateExpression(testData.simpleGraphQL, {
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//     headers: {
//       Authorization: secrets.adminAuth,
//     },
//   }).then((result: any) => {
//     expect(result).toEqual("Company Registration - S-ECL-0011");
//   });
// });

// test("Test GraphQL -- get single application name with custom query authorization", () => {
//   return evaluateExpression(testData.simpleGraphQLCustomHeader, {
//     objects: { secrets },
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//   }).then((result: any) => {
//     expect(result).toEqual("Company Registration - S-ECL-0011");
//   });
// });

// test("Test GraphQL -- List of Application Names", () => {
//   return evaluateExpression(testData.GraphQL_listOfApplications, {
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//       headers: {
//         Authorization: secrets.adminAuth,
//       },
//     },
//   }).then((result: any) => {
//     expect(result).toEqual([
//       "Company Registration - Advance Phamaceutical Manufacturing",
//       "Company Registration - Bayer (Pty) Ltd",
//       "Company Registration - Novartis Spain",
//     ]);
//   });
// });

// test("Test GraphQL -- List of Application Names with Ids", () => {
//   return evaluateExpression(testData.GraphQL_listOfApplicationsWithId, {
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//       headers: {
//         Authorization: secrets.adminAuth,
//       },
//     },
//   }).then((result: any) => {
//     expect(result).toEqual([
//       { id: 45, name: "Product Registration - S-LZU-0014" },
//       { id: 46, name: "Company License -- Modern medicines or Medical devices - S-MTC-0013" },
//       { id: 47, name: "Product Registration - Epivir 150 mg film-coated tablet" },
//     ]);
//   });
// });

// test("Test GraphQL -- Get list of templates -- no return node specifed", () => {
//   return evaluateExpression(testData.GraphQL_listOfTemplates_noReturnSpecified, {
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//     headers: {
//       Authorization: secrets.adminAuth,
//     },
//   }).then((result: any) => {
//     expect(result).toEqual({
//       templates: {
//         edges: [
//           {
//             node: {
//               name: "Product Registration",
//             },
//           },
//           {
//             node: {
//               name: "Company Registration",
//             },
//           },
//         ],
//       },
//     });
//   });
// });

// test("Test GraphQL -- Count templates -- passing params as object option", () => {
//   return evaluateExpression(testData.GraphQL_CountTemplates_objectParamsOption, {
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//   }).then((result: any) => {
//     expect(result).toEqual(24);
//   });
// });

// test("Test GraphQL -- count Responses on current Application - using empty url (default)", () => {
//   return evaluateExpression(testData.GraphQL_CountApplicationResponses, {
//     objects: { application: testData.application },
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//     headers: {
//       Authorization: secrets.adminAuth,
//     },
//   }).then((result: any) => {
//     expect(result).toEqual(20);
//   });
// });

// test("Test GraphQL -- get continents list from External Graphql API ", () => {
//   return evaluateExpression(testData.GraphQL_GetContinentsList_ExternalAPI, {
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//   }).then((result: any) => {
//     expect(result).toEqual(testData.continentsResult);
//   });
// });

test("Test GraphQL -- get country details by code from External Graphql API ", () => {
  return evaluateExpression(testData.GraphQL_GetCountryByCode_ExternalAPI, {
    graphQLConnection: {
      fetch: fetch,
      endpoint: graphQLendpoint,
    },
  }).then((result: any) => {
    expect(result).toEqual("Oceania");
  });
});

test("Test GraphQL -- Check result of field can be null", () => {
  return evaluateExpression(testData.GraphQL_CheckDefaultResultIsNull, {
    graphQLConnection: {
      fetch: fetch,
      endpoint: graphQLendpoint,
    },
  }).then((result: any) => {
    expect(result).toBe(null);
  });
});

// More complex combinations

test("Test concatenate user First and Last names", () => {
  return evaluateExpression(testData.concatFirstAndLastNames, {
    objects: { user: testData.user },
  }).then((result: any) => {
    expect(result).toBe("Carl Smith");
  });
});

// test("Test Validation: Company name is unique", () => {
//   return evaluateExpression(testData.complexValidation, {
//     objects: { form2: testData.form2 },
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//   }).then((result: any) => {
//     expect(result).toBe(true);
//   });
// });

// test("Test email validation -- email is unique and is valid email", () => {
//   return evaluateExpression(testData.emailValidation, {
//     objects: { form: testData.form },
//     APIfetch: fetch,
//     headers: {
//       Authorization: secrets.nonRegisteredAuth,
//     },
//   }).then((result: any) => {
//     expect(result).toBe(true);
//   });
// });

test("Test visibility condition -- Answer to Q1 is Drug Registration and user belongs to at least one organisation", () => {
  return evaluateExpression(testData.complex1, {
    objects: { form: testData.form, user: testData.user },
    pgConnection: pgConnect,
  }).then((result: any) => {
    expect(result).toBe(true);
  });
});

// Non-standard input expressions

test("Input is a number", () => {
  return evaluateExpression(10).then((result: any) => {
    expect(result).toEqual(10);
  });
});

test("Input is an array", () => {
  return evaluateExpression(["Company A", "Company B", "XYZ Pharma"]).then((result: any) => {
    expect(result).toEqual(["Company A", "Company B", "XYZ Pharma"]);
  });
});

test("Input is a string", () => {
  return evaluateExpression("Friday drinks?").then((result: any) => {
    expect(result).toEqual("Friday drinks?");
  });
});

test("Compare two literal strings", () => {
  return evaluateExpression({ operator: "=", children: ["monkeys", "monkeys"] }).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Compare literal string vs object value string", () => {
  return evaluateExpression({ operator: "=", children: ["monkey", { value: "monkey" }] }).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Compare literal numbers", () => {
  return evaluateExpression({ operator: "=", children: [234, 234] }).then((result: any) => {
    expect(result).toEqual(true);
  });
});

test("Compare two unequal literal strings", () => {
  return evaluateExpression({ operator: "=", children: ["boys", "girls"] }).then((result: any) => {
    expect(result).toEqual(false);
  });
});

test("Compare unequal literal string vs object value string", () => {
  return evaluateExpression({ operator: "=", children: ["beer", { value: "wine" }] }).then((result: any) => {
    expect(result).toEqual(false);
  });
});

test("Compare unequal literal numbers", () => {
  return evaluateExpression({ operator: "=", children: [234, 7] }).then((result: any) => {
    expect(result).toEqual(false);
  });
});

// Null matches undefined with loose equality (==)
test("Compare null vs undefined", () => {
  return evaluateExpression({ operator: "=", children: [null, undefined] }).then((result: any) => {
    expect(result).toEqual(true);
  });
});

// objectFunctions operator
test("Object functions -- double elements in array", () => {
  return evaluateExpression(testData.obFunc1, {
    objects: { functions: testData.functions },
  }).then((result: any) => {
    expect(result).toEqual([2, 4, 6, "fourfour"]);
  });
});

test("Object functions -- generate a date from two strings", () => {
  return evaluateExpression(testData.obFunc2, {
    objects: { functions: testData.functions },
  }).then((result: any) => {
    expect(result).toEqual(new Date("December 17, 1995 03:24:00"));
  });
});

// Type conversion
test("Extract numbers from array", () => {
  return evaluateExpression(
    {
      operator: "objectProperties",
      type: "number",
      children: ["responses.orgs.id"],
    },
    {
      objects: { responses: testData.responses },
    }
  ).then((result: any) => {
    expect(result).toBe(628);
  });
});

// test("Join array into single string", () => {
//   return evaluateExpression(testData.listOfOrgs, {
//     graphQLConnection: {
//       fetch: fetch,
//       endpoint: graphQLendpoint,
//     },
//   }).then((result: any) => {
//     expect(result).toBe(
//       "Food & Drug Agency,Pharma123,Manufacturer Medical,National Medical,Holistic Medicine AU,Bayer (Pty) Ltd,Novartis Spain,Fine Chemicals Corp (Pty) Ltd,Pharma Suppliers,Regional Pharm First,Pharmed Corp Ltd Pty,Global Health Incorporated,Adam Company 2"
//     );
//   });
// });

test("Coerce string to boolean", () => {
  return evaluateExpression({
    operator: "=",
    children: [
      {
        operator: "+",
        type: "bool",
        children: ["three"],
      },
      true,
    ],
  }).then((result: any) => {
    expect(result).toBe(true);
  });
});

// Access array by index
test("Return index from array", () => {
  return evaluateExpression(
    {
      operator: "objectProperties",
      children: ["responses.user.selection[1]"],
    },
    {
      objects: { responses: testData.responses },
    }
  ).then((result: any) => {
    expect(result).toEqual({
      id: 9,
      email: "noreply@sussol.net",
      lastName: "Madruga",
      username: "nicole",
      firstName: "Nicole",
    });
  });
});

test("Return index -- middle of string", () => {
  return evaluateExpression(
    {
      operator: "objectProperties",
      children: ["responses.user.selection[0].username"],
    },
    {
      objects: { responses: testData.responses },
    }
  ).then((result: any) => {
    expect(result).toEqual("carl");
  });
});

test("Try and access non-indexable object", async () => {
  try {
    await evaluateExpression(
      {
        operator: "objectProperties",
        children: ["responses.user[2]"],
      },
      {
        objects: { responses: testData.responses },
      }
    );
  } catch (e) {
    expect(e.message).toMatch(/Unable to extract object property\nLooking for property: 2\nIn object: {\"id\":629/);
  }
});

// Errors and fallbacks

test("Throw error -- bad API call", async () => {
  try {
    await evaluateExpression({
      operator: "API",
      children: [],
    });
  } catch (e) {
    expect(e.message).toMatch("Invalid API query");
  }
});

test("Error bubbles up from child -- unresolved object property", async () => {
  try {
    await evaluateExpression(testData.nestedErrorQuery, {
      objects: { responses: testData.responses },
    });
  } catch (e) {
    expect(e.message).toMatch(
      /Unable to extract object property\nLooking for property: application\nIn object: {\"responses\":/
    );
  }
});

test("Fallback with error at top-level", () => {
  return evaluateExpression(
    {
      operator: "objectProperties",
      children: ["responses.user.texts"],
      fallback: "Not found!",
    },
    {
      objects: { responses: testData.responses },
    }
  ).then((result: any) => {
    expect(result).toEqual("Not found!");
  });
});

test("Fallback top-level, error deep", () => {
  return evaluateExpression(testData.nestedSQLErrorWithFallback, {
    objects: { responses: testData.responses },
  }).then((result: any) => {
    expect(result).toEqual("Ignore SQL problem");
  });
});

test("Fallback and error deep", () => {
  return evaluateExpression(testData.nestedFallback, {
    objects: { responses: testData.responses },
  }).then((result: any) => {
    expect(result).toEqual("629 <Not found>");
  });
});

test("GraphQL empty array fallback when query returns incomplete data", () => {
  return evaluateExpression(testData.graphQLErrorWithFallback, {
    objects: { responses: testData.responses },
  }).then((result: any) => {
    expect(result).toEqual([]);
  });
});

afterAll(() => {
  pgConnect.end();
});
