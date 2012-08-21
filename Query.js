/**
 * @fileOverview Provides a Query class for building sparql queries incremental-
 * ly. WARNING: My grasp of Sparql semantics is slight and shaky. Much of what
 * happens here is still guesswork and will be fixed as my understanding grows.
 *
 * There's nothing going on here that couldn't be done with Jena (probably), but
 * then I'd have to use Java.
 *
 * 
 *
 * @author Noah Feldman
 *
 * @requires  rdfstore-js
 *
 */
var AbstractQueryTree = require("./rdfstore-js/src/js-sparql-parser/src/abstract_query_tree").AbstractQueryTree.AbstractQueryTree,

    // these two are from my requirer project
    each  = require('./each'),
    visit = require('./visit'),

    Query;

// helpers
function addBGP (dest, src) {
    if (dest.token == 'basicgraphpattern' && dest.triplesContext[0].subject.value == src[0].subject.value)
        [].push.apply(dest.triplesContext, src);
}

function mergeBGP (dest, src, callback) {
    if (dest.token == 'groupgraphpattern') {
        each(dest.patterns, function (_) {
            addBGP(_, src);
            callback();
        });
    }
}

/**
 * @class Query
 * @param  {string} [prefixes]
 * @return {Query}
 */
Query = module.exports = function (prefixes) {
    this.prefixes = prefixes || '';
    this.query = '';
    this.aqt = new AbstractQueryTree();
    this.parsed = null;
    this._projSet = Object.create(null);
    this._prfxMap = Object.create(null);
};


Query.prototype.parse = function (query) {
    this.parsed = this.aqt.parseQueryString(this.prefixes + '\n' + query);

    !this.prefixes && console.warn('No prefixes provided');

    // prevent accidentally calling parse again.
    this.parse = function () {console.warn('parse called once. to call again, first delete parse from the current instance')};

    // build a set to track vars
    each(this.parsed.units[0].projection, function (token) {
        if (token.kind == 'var')
            this._projSet[token.value.value] = 1;
    }, this);

    // build a hash of prefixes
    each(this.parsed.prologue.prefixes, function (token) {
        !this._prfxMap[token.prefix] && (this._prfxMap[token.prefix] = token.local);
    }, this);

    return this;
};

Query.prototype._updateProjection = function (tree) {
    var newProjection = tree.units[0].projection,
        ourProjection = this.parsed.units[0].projection;

    each(newProjection, function (token) {
        if (token.kind == 'var') {
            if (!this._projSet[token.value.value]) {
                this._projSet[token.value.value] = 1;
                this.parsed.units[0].projection.push(token);
            }
        }
    }, this);
};

Query.prototype._addBGP = function (tree) {
    var newBGP, pattern, isOptional = false;

    if (tree.units.length != 1 || this.parsed.units.length != 1)
        throw new Error('Query#_addBGP> don\'t yet know what to do with more than one unit');

    // default is just another triple
    newBGP = tree.units[0].pattern.patterns[0].triplesContext;
    // if it isn't ... well, for now, it had better be an optional whatsit
    if (!newBGP && tree.units[0].pattern.patterns[0].token == 'optionalgraphpattern') {
        isOptional = true;
        newBGP = tree.units[0].pattern.patterns[0];
    }

    // 1. make sure the pattern token is one we understand
    pattern = this.parsed.units[0].pattern;
    if (pattern.token != 'groupgraphpattern')
        throw new Error('Query#_addBGP> don\'t know how to add a BGP to the ' + pattern.token + ' encountered in existing parse tree');

    this._updateProjection(tree);

// according to the grammar
// [25]    GroupOrUnionGraphPattern      ::=   GroupGraphPattern ( 'UNION' GroupGraphPattern )*

    if (isOptional) {
        pattern.patterns.push(newBGP);
    } else {
        each(pattern.patterns, function (_) {
            var addedToUnion = false;

            // if we're dealing with a union, figure out if the subject of the
            // new triple is also a subject of either subclause and added it ...
            // I don't think UNION has to be on subject, but assume it for now.
            if (_.token == 'graphunionpattern') {
                each(_.value, function (_value) {
                    if (_value.token == 'groupgraphpattern') {
                        mergeBGP(_value, newBGP, function () {addedToUnion = true});
                    }
                });
            }
            // if either this isn't a union or the subject isn't part of an
            // alternative, then we can (I think) just add it as another pattern
            // TODO undo confusion
            if (!addedToUnion) {
                if (_.token  == 'groupgraphpattern') {
                    mergeBGP(_.value, newBGP);
                } else if (_.token == 'basicgraphpattern') {
                    addBGP(_, newBGP);
                }
            }
        });
    }
    return this;
};

Query.prototype._genTriple = function (spo) {
    var j = -1,
        svars = 'SELECT ',
        where = ' WHERE {',
        tree, e;

    spo.distinct && (svars += 'DISTINCT ') && (delete spo.distinct);

    each(spo, function (value, key, i) {
        !value.indexOf('?') && (svars += (++j?' ':'') + value);
        where += (i?' ':'') + value;
    });

    where += '}';

    try {
        tree = this.aqt.parseQueryString(svars + where);
    } catch (e) {
        console.error('\n\n',e.message,'\n\n');
        process.exit(1);
    }
    return tree;
};

Query.prototype.addSPO = function (spo) {
    var tree = this._genTriple(spo);
    this._addBGP(tree);
    return this;
};

Query.prototype.addOptionalSPO = function (spo) {
    var tree = this._genTriple(spo);
    // at this point we should have a basicgraphpattern containing a single
    // triple. All we have to do is take that triple and make it optional.
    tree.units[0].pattern.patterns.push({
        token: "optionalgraphpattern",
        value: {
            token: "groupgraphpattern",
            patterns: [tree.units[0].pattern.patterns.pop()]
        }
    });
    this._addBGP(tree);

};

Query.prototype.toString = function () {
    var prfxused = {}, // set of prefixes we've encountered
        prefhash = this._prfxMap,
        prefixes = '',
        svars    = '',
        query    = [],
        state    = {GUPct:-1},
    // presuambly, if there were a count() or something, there'd be more units,
    // but we're going to pretend there's only ever one
        unit = this.parsed.units[0];


    // 1. get bits and pieces.

    if (unit.kind == 'select')
        query.push(' SELECT');
    else
        throw new Error('Query only understands basic SELECTs at the moment.');

    if (unit.modifier)
        query.push(unit.modifier);

// we could also just go over this._projSet, but I don't yet know what other
// legal tokens there are in a projection and for now we want to panic if we
// aren't seeing variables
    each(unit.projection, function (token, i) {
        if (token.kind != 'var')
            throw new Error('Query only understands variables in projection at the moment.'); // can have other stuff?

        svars += (i?' ':'') + '?' + token.value.value;
    });

    query.push(svars);

    query.push('WHERE');
    query.push('{')

    // now we just traverse the patterns and build up our string
    // much easier to do than to explain, unfortunately.
    // The syntax rules for sparql are annoying.
    visit(unit.pattern.patterns, function (_) { // pre
        if (_ && _.token) {
            console.log(_.token)
            if (_.token == 'optionalgraphpattern') {
                query.push('OPTIONAL');
            }

            if (_.token == 'graphunionpattern') {
                state.inGUP = true;
                ++state.GUPct;
                // query.push('{');
            }

            if (_.token == 'groupgraphpattern')
                query.push('{');

            if (_.token == 'var') {
                query.push('?' + _.value);
            } else if (_.token == 'uri') {
                if (_.prefix) {
                    if (!prfxused[_.prefix]) {
                        // add this to the prefixes string and the set of used prefixes
                        prefixes += 'PREFIX ' + _.prefix + ': <' + prefhash[_.prefix] + '> ';
                        prfxused[_.prefix] = 1;
                    }
                    query.push(_.prefix + ':' + _.suffix);
                } else if (_.value) {
                    query.push('<' + _.value + '>');
                }
            }
        }

    }, function (_, p) { // post
        _ && _.subject && query.push('.'); // end of a triple

        if (_.token == 'groupgraphpattern')
            query.push('}');

        if (_.token == 'groupgraphpattern' && state.inGUP)
            query.push('UNION');

        if (_.token && _.token == 'graphunionpattern') {
            !(state.GUPct % 2) && query.pop();
            state.inGUP = false;
            state.GUPct = -1;
        }
    });
    query.push('}')
    return this.query = prefixes + query.join(' ');

};
