"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyStringArray = exports.parseStringArray = void 0;
const parseStringArray = (value) => {
    if (!value)
        return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.filter((item) => typeof item === 'string' && item.length > 0);
        }
    }
    catch {
    }
    return [];
};
exports.parseStringArray = parseStringArray;
const stringifyStringArray = (value) => {
    if (value === undefined)
        return undefined;
    return JSON.stringify(value.filter((item) => item.trim().length > 0));
};
exports.stringifyStringArray = stringifyStringArray;
//# sourceMappingURL=json.js.map