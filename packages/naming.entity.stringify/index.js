'use strict';

const assert = require('assert');

/**
 * Forms a string according to object representation of BEM entity.
 *
 * @param {Object|BemEntityName} entity - object representation of BEM entity.
 * @param {BemNamingDelims} delims - separates entity names from each other.
 * @returns {String}
 */
function stringify(entity, delims) {
    if (!entity || !entity.block) {
        return '';
    }

    let res = entity.block;

    if (entity.elem !== undefined) {
        res += delims.elem + entity.elem;
    }

    if (entity.mod !== undefined) {
        res += delims.mod.name + entity.mod.name;
        
        if (entity.mod.val !== undefined && entity.mod.val !== true) {
            res += delims.mod.val + entity.mod.name;
        }
    }

    return res;
}

/**
 * Creates `stringify` function for specified naming convention.
 *
 * @param {BemNamingEntityConvention} convention - options for naming convention.
 * @returns {Function}
 */
module.exports = (convention) => {
    assert(convention.delims && convention.delims.elem && convention.delims.mod,
        '@bem/sdk.naming.entity.stringify: convention should be an instance of BemNamingEntityConvention');
    return (entity) => stringify(entity, convention.delims);
};
