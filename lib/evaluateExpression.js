"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEvaluationExpression = void 0;
const buildObject_1 = __importDefault(require("./resolvers/buildObject"));
const defaultParameters = {};
exports.isEvaluationExpression = (expressionOrValue) => expressionOrValue instanceof Object &&
    expressionOrValue !== null &&
    !Array.isArray(expressionOrValue) &&
    !!expressionOrValue.operator;
const evaluateExpression = (inputQuery, params = defaultParameters) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Base cases -- leaves get returned unmodified
    if (!(inputQuery instanceof Object))
        return inputQuery;
    if ('value' in inputQuery)
        return inputQuery.value; // Deprecate this soon
    if (!('operator' in inputQuery))
        return inputQuery;
    const evaluationExpressionInstance = (_inputQuery) => evaluateExpression(_inputQuery, params);
    let childrenResolved = [];
    // Recursive case
    if ('children' in inputQuery) {
        try {
            childrenResolved = yield Promise.all(inputQuery.children.map((child) => evaluationExpressionInstance(child)));
        }
        catch (err) {
            if ((inputQuery === null || inputQuery === void 0 ? void 0 : inputQuery.fallback) !== undefined)
                return inputQuery.fallback;
            else
                throw err;
        }
    }
    let result;
    try {
        switch (inputQuery.operator) {
            case 'AND':
                result = childrenResolved.reduce((acc, child) => acc && child, true);
                break;
            case 'OR':
                result = childrenResolved.reduce((acc, child) => acc || child, false);
                break;
            case 'REGEX':
                try {
                    const str = childrenResolved[0];
                    const re = new RegExp(childrenResolved[1]);
                    result = re.test(str);
                }
                catch (_b) {
                    throw new Error('Problem with REGEX');
                }
                break;
            case '=':
                result = childrenResolved.every((child) => child == childrenResolved[0]);
                break;
            case '!=':
                result = childrenResolved[0] != childrenResolved[1];
                break;
            case 'CONCAT':
            case '+':
                if (childrenResolved.length === 0) {
                    result = childrenResolved;
                    break;
                }
                // Reduce based on "type" if specified
                if ((inputQuery === null || inputQuery === void 0 ? void 0 : inputQuery.type) === 'string') {
                    result = childrenResolved.reduce((acc, child) => acc.concat(child), '');
                    break;
                }
                if ((inputQuery === null || inputQuery === void 0 ? void 0 : inputQuery.type) === 'array') {
                    result = childrenResolved.reduce((acc, child) => acc.concat(child), []);
                    break;
                }
                // Concatenate arrays/strings
                if (childrenResolved.every((child) => typeof child === 'string' || Array.isArray(child))) {
                    result = childrenResolved.reduce((acc, child) => acc.concat(child));
                    break;
                }
                // Merge objects
                if (childrenResolved.every((child) => child instanceof Object && !Array.isArray(child))) {
                    {
                        result = childrenResolved.reduce((acc, child) => (Object.assign(Object.assign({}, acc), child)), {});
                        break;
                    }
                }
                // Or just try to add any other types
                result = childrenResolved.reduce((acc, child) => acc + child);
                break;
            case '?':
                result = childrenResolved[0] ? childrenResolved[1] : childrenResolved[2];
                break;
            case 'objectProperties':
                if (Object.entries(params).length === 0)
                    return 'No parameters received for objectProperties node';
                try {
                    const inputObject = (params === null || params === void 0 ? void 0 : params.objects) ? params.objects : {};
                    const property = childrenResolved[0];
                    const fallback = childrenResolved === null || childrenResolved === void 0 ? void 0 : childrenResolved[1];
                    result = extractProperty(inputObject, property, fallback);
                }
                catch (err) {
                    throw err;
                }
                break;
            case 'stringSubstitution':
                const origString = childrenResolved[0];
                const replacements = childrenResolved.slice(1);
                const regex = /%([\d]+)/g; // To-Do: handle escaping literal values
                const parameters = (origString.match(regex) || []).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
                const uniqueParameters = new Set(parameters);
                const replacementsObj = zipArraysToObject(Array.from(uniqueParameters), replacements);
                let outputString = origString;
                Object.entries(replacementsObj)
                    .reverse()
                    .forEach(([param, replacement]) => {
                    outputString = outputString.replace(new RegExp(`${param}`, 'g'), replacement !== null && replacement !== void 0 ? replacement : '');
                });
                result = outputString;
                break;
            case 'POST':
            case 'GET':
            case 'API':
                const { APIfetch } = params;
                const isPostRequest = inputQuery.operator === 'POST';
                let urlWithQuery, returnedProperty, requestBody, headers;
                try {
                    const { url, headers: queryHeaders, fieldNames, values, returnProperty, } = assignChildNodesToQuery([
                        '',
                        ...childrenResolved,
                    ]);
                    headers = queryHeaders !== null && queryHeaders !== void 0 ? queryHeaders : params === null || params === void 0 ? void 0 : params.headers;
                    returnedProperty = returnProperty;
                    urlWithQuery =
                        fieldNames.length > 0
                            ? `${url}?${fieldNames
                                .map((field, index) => field + '=' + values[index])
                                .join('&')}`
                            : url;
                    requestBody = isPostRequest ? zipArraysToObject(fieldNames, values) : null;
                }
                catch (_c) {
                    throw new Error('Invalid API query');
                }
                let data;
                try {
                    data = isPostRequest
                        ? yield fetchAPIrequest({
                            url: urlWithQuery,
                            APIfetch,
                            method: 'POST',
                            body: requestBody,
                            headers,
                        })
                        : yield fetchAPIrequest({ url: urlWithQuery, APIfetch, headers });
                }
                catch (_d) {
                    throw new Error('Problem with API call');
                }
                try {
                    result = extractAndSimplify(data, returnedProperty);
                }
                catch (_e) {
                    throw new Error('Problem parsing requested node from API result');
                }
                break;
            case 'pgSQL':
                if (!params.pgConnection)
                    throw new Error('No Postgres database connection provided');
                try {
                    result = yield processPgSQL(childrenResolved, inputQuery === null || inputQuery === void 0 ? void 0 : inputQuery.type, params.pgConnection);
                }
                catch (err) {
                    throw err;
                }
                break;
            case 'graphQL':
                if (!params.graphQLConnection)
                    throw new Error('No GraphQL database connection provided');
                const gqlHeaders = (_a = params === null || params === void 0 ? void 0 : params.headers) !== null && _a !== void 0 ? _a : params.graphQLConnection.headers;
                result = yield processGraphQL(childrenResolved, params.graphQLConnection, gqlHeaders);
                break;
            case 'buildObject':
                result = buildObject_1.default(inputQuery, evaluationExpressionInstance);
                break;
            case 'objectFunctions':
                const inputObject = (params === null || params === void 0 ? void 0 : params.objects) ? params.objects : {};
                const funcName = childrenResolved[0];
                const args = childrenResolved.slice(1);
                const func = extractProperty(inputObject, funcName);
                result = yield func(...args);
                break;
            default:
                return 'No matching operators';
            // etc. for as many other operators as we want/need.
        }
    }
    catch (err) {
        if ((inputQuery === null || inputQuery === void 0 ? void 0 : inputQuery.fallback) !== undefined)
            return inputQuery.fallback;
        else
            throw err;
    }
    if (!(inputQuery === null || inputQuery === void 0 ? void 0 : inputQuery.type))
        return result;
    // Type conversion
    switch (inputQuery.type) {
        case 'number':
            return Number.isNaN(Number(result)) ? result : Number(result);
        case 'string':
            return String(result);
        case 'array':
            return Array.isArray(result) ? result : [result];
        case 'boolean':
        case 'bool':
            return Boolean(result);
        default:
            return result;
    }
});
function processPgSQL(queryArray, queryType, connection) {
    return __awaiter(this, void 0, void 0, function* () {
        const expression = {
            text: queryArray[0],
            values: queryArray.slice(1),
            rowMode: queryType ? 'array' : '',
        };
        try {
            const res = yield connection.query(expression);
            switch (queryType) {
                case 'array':
                    return res.rows.flat();
                case 'string':
                    return res.rows.flat().join(' ');
                case 'number':
                    const result = res.rows.flat();
                    return Number.isNaN(Number(result)) ? result : Number(result);
                default:
                    return res.rows;
            }
        }
        catch (err) {
            throw err;
        }
    });
}
/*
 * processGraphQL
 * Will process the call to a GraphQL API (internal or external) using params
 * received in the queryArray to determine the following:
 * @param queryArray
 *   - url: string with an external API or "graphQLEndpoint" for internal [Default]
 *   - query: GraphQL query to call (including the fields to be returned)
 *  A list of dynamic props to pass (break-down in 2 fields)
 *   - fieldNames: array of field names included in the query
 *   - values: array of values to be passed for each field names
 *  And the returned field:
 *   - returnProperty: string (which can be in any level of the query result)
 * @param connection
 *   - fetch: Method used for fetching (front-end bind to browser)
 */
function processGraphQL(queryArray, connection, gqlHeaders = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { url, headers: queryHeaders, query, fieldNames, values, returnProperty, } = assignChildNodesToQuery(queryArray);
            const variables = zipArraysToObject(fieldNames, values);
            const headers = queryHeaders !== null && queryHeaders !== void 0 ? queryHeaders : gqlHeaders;
            const data = yield graphQLquery(url, query, variables, connection, headers);
            if (!data)
                throw new Error('GraphQL query problem');
            try {
                return extractAndSimplify(data, returnProperty);
            }
            catch (err) {
                throw err;
            }
        }
        catch (err) {
            throw err;
        }
    });
}
const extractAndSimplify = (data, returnProperty, fallback = undefined) => {
    try {
        const selectedProperty = returnProperty ? extractProperty(data, returnProperty, fallback) : data;
        if (Array.isArray(selectedProperty))
            return selectedProperty.map((item) => simplifyObject(item));
        if (returnProperty) {
            if (selectedProperty === null)
                return null; // GraphQL field can return null as valid result
            return simplifyObject(selectedProperty);
        }
        return selectedProperty;
    }
    catch (err) {
        throw err;
    }
};
const assignChildNodesToQuery = (childNodes) => {
    const skipFields = 3; // skip query, url and fieldNames
    const query = childNodes[0];
    let url;
    let headers = null;
    if (typeof childNodes[1] === 'object') {
        url = childNodes[1].url;
        headers = childNodes[1].headers;
    }
    else
        url = childNodes[1];
    const fieldNames = childNodes[2];
    const lastFieldIndex = fieldNames.length + skipFields;
    const values = childNodes.slice(skipFields, lastFieldIndex);
    const returnProperty = childNodes[lastFieldIndex];
    return { url, headers, query, fieldNames, values, returnProperty };
};
// Build an object from an array of field names and an array of values
const zipArraysToObject = (variableNames, variableValues) => {
    const createdObject = {};
    variableNames.map((name, index) => {
        createdObject[name] = variableValues[index];
    });
    return createdObject;
};
// Returns a specific property or index (e.g. application.name) from a nested Object
const extractProperty = (data, node, fallback = undefined) => {
    if (typeof data === 'undefined') {
        if (fallback !== undefined)
            return fallback;
        else
            throw new Error('Object property not found');
    }
    const propertyPathArray = Array.isArray(node) ? node : splitPropertyString(node);
    const currentProperty = propertyPathArray[0];
    if (Array.isArray(data)) {
        if (typeof currentProperty === 'number')
            if (propertyPathArray.length === 1)
                if ((data === null || data === void 0 ? void 0 : data[currentProperty]) === undefined) {
                    if (fallback !== undefined)
                        return fallback;
                    else
                        throw new Error('Object property not found');
                }
                else
                    return data[currentProperty];
            else
                return extractProperty(data[currentProperty], propertyPathArray.slice(1), fallback);
        // If an array, extract the property from *each item*
        return data.map((item) => extractProperty(item, propertyPathArray, fallback));
    }
    if (propertyPathArray.length === 1)
        if (typeof currentProperty === 'number') {
            if (fallback !== undefined)
                return fallback;
            else
                throw new Error('Object not index-able');
        }
        else {
            if ((data === null || data === void 0 ? void 0 : data[currentProperty]) === undefined) {
                if (fallback !== undefined)
                    return fallback;
                else
                    throw new Error('Object property not found');
            }
            else
                return data[currentProperty];
        }
    else
        return extractProperty(data === null || data === void 0 ? void 0 : data[currentProperty], propertyPathArray.slice(1), fallback);
};
// Splits a string representing a (nested) property/index on an Object or Array
// into array of strings/indexes
// e.g. "data.organisations.nodes[0]" => ["data","organisations", "nodes", 0]
const splitPropertyString = (propertyPath) => {
    const arr = propertyPath.split('.').map((part) => {
        const match = /([A-Za-z]+)\[(\d)\]/g.exec(part);
        return !match ? part : [match[1], Number(match[2])];
    });
    return arr.flat();
};
// If Object has only 1 property, return just the value of that property,
// else return the whole object.
const simplifyObject = (item) => {
    return typeof item === 'object' && Object.keys(item).length === 1 ? Object.values(item)[0] : item;
};
// Abstraction for GraphQL database query using Fetch
const graphQLquery = (url, query, variables, connection, headers) => __awaiter(void 0, void 0, void 0, function* () {
    // Get an external endpoint to use, or get the default GraphQL endpoint if received:
    // "graphqlendpoint" (case insensitive), an empty string "" or null
    const endpoint = url !== null && url.toLowerCase() !== 'graphqlendpoint' && url !== ''
        ? url
        : connection.endpoint;
    const queryResult = yield connection.fetch(endpoint, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, headers),
        body: JSON.stringify({
            query: query,
            variables: variables,
        }),
    });
    const data = yield queryResult.json();
    if (data === null || data === void 0 ? void 0 : data.errors) {
        const errorMessage = data.errors[0].message;
        throw new Error(errorMessage);
    }
    return data.data;
});
// GET/POST request using fetch (node or browser variety)
const fetchAPIrequest = ({ url, APIfetch, method = 'GET', body, headers = {}, }) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield APIfetch(url, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body),
    });
    return yield result.json();
});
exports.default = evaluateExpression;
