// https://github.com/nfeldman/requirer/blob/ebec66223bafe07c87797e966d48913e4c908624/lib/each.js
/**
 * A basic foreach function, will attempt to iterate anything
 * @param  {Object|Array}      thing The collection to iterate over
 * @param  {Function(entry, key, index)} callback   The function to apply to 
 *      each entry in the collection being iterated. It receives 3 arguments
 *        1) the current value
 *        2) the key to the current value -- in arrays, this is an index
 *        3) the current iteration -- in arrays, this == the index
 * @param  {Object} [context]  The `this` of the callback
 * @return {undefined}
 */
var hasOwn = {}.hasOwnProperty;
module.exports = function (thing, callback, context) {
    var i = 0, x;
    if (Array.isArray(thing))
        for (x = thing.length; i < x; i++)
            callback.call(context, thing[i], i, i);
    else if (typeof thing == 'object')
        for (x in thing)
            hasOwn.call(thing, x) && callback.call(context, thing[x], x, i++);
};