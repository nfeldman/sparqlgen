var each = require('./each');

/**
 * Performs a recursive depth-first walk of a structure comprised of JS Objects 
 * and Arrays with no explict parent->child or sibling pointers (i.e. no 
 * .firstChild or .nextSibling) calling an optional function prior to visiting 
 * the immediate children of the current node and an optional, and optionally 
 * the same, function afterwards, i.e. you can use this for pre- or post-order 
 * traversal. It is assumed that callbacks will mutate the tree.
 * @param  {Object} node   The node from which to start a traversal
 * @param  {Function(node, parent, ancestors)} [prefunc]  Function to call prior
 *           to visiting child nodes. Return truthy to prevent visiting children.
 * @param  {Function(node, parent, ancestors)|true} [postfunc] Function to call 
 *           after visiting child nodes. If `true`, prefunc will be called again
 * @param  {Object} [context]  Object to set as the `this` of the callbacks
 * @param  {Array} [ancestors] An array of arrays tracing the path to the 
 *          current node. It is not created if omitted.
 * @return {mixed} Either undefined or a truthy value returned by prefunc
 * @author  Noah Feldman
 */

function visit (node, prefunc, postfunc, context, ancestors, parent) {
    var end,  path;

    prefunc && (end = prefunc.call(context, node, parent, ancestors) || false);
    
    if (end) // if end is truthy, we can stop early
        return end;

    path = ancestors && Array.isArray(ancestors) ? [node, ancestors] : undefined;

    each(node, function (child, key) {
        child && typeof child == 'object' &&
            visit(child, prefunc, postfunc, context, path, node);
    });

    if (postfunc) {
        if (postfunc == true)
            prefunc.call(context, node, parent, ancestors);
        else if (typeof postfunc == 'function')
            postfunc.call(context, node, parent, ancestors);
    }
}
module.exports = visit;