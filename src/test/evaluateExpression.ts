export const x = 5
// Test suite for the evaluateExpression() function

// // More complex combinations

// test("Test concatenate user First and Last names", () => {
//   return evaluateExpression(testData.concatFirstAndLastNames, {
//     objects: { user: testData.user },
//   }).then((result: any) => {
//     expect(result).toBe("Carl Smith");
//   });
// });

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

// test("Test visibility condition -- Answer to Q1 is Drug Registration and user belongs to at least one organisation", () => {
//   return evaluateExpression(testData.complex1, {
//     objects: { form: testData.form, user: testData.user },
//     pgConnection: pgConnect,
//   }).then((result: any) => {
//     expect(result).toBe(true);
//   });
// });

// // Non-standard input expressions

// test("Input is a number", () => {
//   return evaluateExpression(10).then((result: any) => {
//     expect(result).toEqual(10);
//   });
// });

// test("Input is an array", () => {
//   return evaluateExpression(["Company A", "Company B", "XYZ Pharma"]).then((result: any) => {
//     expect(result).toEqual(["Company A", "Company B", "XYZ Pharma"]);
//   });
// });

// test("Input is a string", () => {
//   return evaluateExpression("Friday drinks?").then((result: any) => {
//     expect(result).toEqual("Friday drinks?");
//   });
// });

// test("Compare two literal strings", () => {
//   return evaluateExpression({ operator: "=", children: ["monkeys", "monkeys"] }).then((result: any) => {
//     expect(result).toEqual(true);
//   });
// });

// test("Compare literal string vs object value string", () => {
//   return evaluateExpression({ operator: "=", children: ["monkey", { value: "monkey" }] }).then((result: any) => {
//     expect(result).toEqual(true);
//   });
// });

// test("Compare literal numbers", () => {
//   return evaluateExpression({ operator: "=", children: [234, 234] }).then((result: any) => {
//     expect(result).toEqual(true);
//   });
// });

// test("Compare two unequal literal strings", () => {
//   return evaluateExpression({ operator: "=", children: ["boys", "girls"] }).then((result: any) => {
//     expect(result).toEqual(false);
//   });
// });

// test("Compare unequal literal string vs object value string", () => {
//   return evaluateExpression({ operator: "=", children: ["beer", { value: "wine" }] }).then((result: any) => {
//     expect(result).toEqual(false);
//   });
// });

// test("Compare unequal literal numbers", () => {
//   return evaluateExpression({ operator: "=", children: [234, 7] }).then((result: any) => {
//     expect(result).toEqual(false);
//   });
// });

// // Null matches undefined with loose equality (==)
// test("Compare null vs undefined", () => {
//   return evaluateExpression({ operator: "=", children: [null, undefined] }).then((result: any) => {
//     expect(result).toEqual(true);
//   });
// });

// // Type conversion
// test("Extract numbers from array", () => {
//   return evaluateExpression(
//     {
//       operator: "objectProperties",
//       type: "number",
//       children: ["responses.orgs.id"],
//     },
//     {
//       objects: { responses: testData.responses },
//     }
//   ).then((result: any) => {
//     expect(result).toBe(628);
//   });
// });

// // test("Join array into single string", () => {
// //   return evaluateExpression(testData.listOfOrgs, {
// //     graphQLConnection: {
// //       fetch: fetch,
// //       endpoint: graphQLendpoint,
// //     },
// //   }).then((result: any) => {
// //     expect(result).toBe(
// //       "Food & Drug Agency,Pharma123,Manufacturer Medical,National Medical,Holistic Medicine AU,Bayer (Pty) Ltd,Novartis Spain,Fine Chemicals Corp (Pty) Ltd,Pharma Suppliers,Regional Pharm First,Pharmed Corp Ltd Pty,Global Health Incorporated,Adam Company 2"
// //     );
// //   });
// // });

// test("Coerce string to boolean", () => {
//   return evaluateExpression({
//     operator: "=",
//     children: [
//       {
//         operator: "+",
//         type: "bool",
//         children: ["three"],
//       },
//       true,
//     ],
//   }).then((result: any) => {
//     expect(result).toBe(true);
//   });
// });

// // Access array by index
// test("Return index from array", () => {
//   return evaluateExpression(
//     {
//       operator: "objectProperties",
//       children: ["responses.user.selection[1]"],
//     },
//     {
//       objects: { responses: testData.responses },
//     }
//   ).then((result: any) => {
//     expect(result).toEqual({
//       id: 9,
//       email: "noreply@sussol.net",
//       lastName: "Madruga",
//       username: "nicole",
//       firstName: "Nicole",
//     });
//   });
// });

// test("Return index -- middle of string", () => {
//   return evaluateExpression(
//     {
//       operator: "objectProperties",
//       children: ["responses.user.selection[0].username"],
//     },
//     {
//       objects: { responses: testData.responses },
//     }
//   ).then((result: any) => {
//     expect(result).toEqual("carl");
//   });
// });

// test("Try and access non-indexable object", async () => {
//   try {
//     await evaluateExpression(
//       {
//         operator: "objectProperties",
//         children: ["responses.user[2]"],
//       },
//       {
//         objects: { responses: testData.responses },
//       }
//     );
//   } catch (e) {
//     expect(e.message).toMatch(/Unable to extract object property\nLooking for property: 2\nIn object: {\"id\":629/);
//   }
// });

// // Errors and fallbacks

// test("Throw error -- bad API call", async () => {
//   try {
//     await evaluateExpression({
//       operator: "API",
//       children: [],
//     });
//   } catch (e) {
//     expect(e.message).toMatch("Invalid API query");
//   }
// });

// test("Error bubbles up from child -- unresolved object property", async () => {
//   try {
//     await evaluateExpression(testData.nestedErrorQuery, {
//       objects: { responses: testData.responses },
//     });
//   } catch (e) {
//     expect(e.message).toMatch(
//       /Unable to extract object property\nLooking for property: application\nIn object: {\"responses\":/
//     );
//   }
// });

// test("Fallback with error at top-level", () => {
//   return evaluateExpression(
//     {
//       operator: "objectProperties",
//       children: ["responses.user.texts"],
//       fallback: "Not found!",
//     },
//     {
//       objects: { responses: testData.responses },
//     }
//   ).then((result: any) => {
//     expect(result).toEqual("Not found!");
//   });
// });

// test("Fallback top-level, error deep", () => {
//   return evaluateExpression(testData.nestedSQLErrorWithFallback, {
//     objects: { responses: testData.responses },
//   }).then((result: any) => {
//     expect(result).toEqual("Ignore SQL problem");
//   });
// });

// test("Fallback and error deep", () => {
//   return evaluateExpression(testData.nestedFallback, {
//     objects: { responses: testData.responses },
//   }).then((result: any) => {
//     expect(result).toEqual("629 <Not found>");
//   });
// });

// test("GraphQL empty array fallback when query returns incomplete data", () => {
//   return evaluateExpression(testData.graphQLErrorWithFallback, {
//     objects: { responses: testData.responses },
//   }).then((result: any) => {
//     expect(result).toEqual([]);
//   });
// });
