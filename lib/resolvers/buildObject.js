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
Object.defineProperty(exports, "__esModule", { value: true });
const buildObject = (buildObjectQuery, evaluateExpressionInstance) => __awaiter(void 0, void 0, void 0, function* () {
    const result = {};
    const evaluateKeyValue = (key, value) => __awaiter(void 0, void 0, void 0, function* () {
        const [resultKey, resultValue] = yield Promise.all([
            evaluateExpressionInstance(key),
            evaluateExpressionInstance(value),
        ]);
        if (resultKey && typeof value !== 'undefined')
            result[String(resultKey)] = resultValue;
    });
    const evaluations = ((buildObjectQuery === null || buildObjectQuery === void 0 ? void 0 : buildObjectQuery.properties) || []).map(({ key, value }) => evaluateKeyValue(key, value));
    yield Promise.all(evaluations);
    return result;
});
exports.default = buildObject;
