'use strict';

var fs = require('fs'),
    assert = require('assert'),
    path = require('path'),
    rc = require('betterc'),
    Promise = require('pinkie-promise'),
    flatten = require('lodash.flatten'),
    merge = require('./lib/merge'),
    resolveSets = require('./lib/resolve-sets');

/**
 * Constructor
 * @param {Object} [options] object
 * @param {String} [options.name='bem'] - config filename.
 * @param {String} [options.cwd=process.cwd()] project root directory.
 * @param {Object} [options.defaults={}] use this object as fallback for found configs
 * @param {String} [options.pathToConfig] custom path to config on FS via command line argument `--config`
 * @constructor
 */
function BemConfig(options) {
    this._options = options || {};
    // TODO: use cwd for resolver
    this._options.cwd || (this._options.cwd = process.cwd());
    // TODO: use cache
    // this._cache = {};
}

/**
 * Returns all found configs
 *
 * @param {boolean} [isSync=false] - flag to resolve configs synchronously
 * @returns {Promise|Array}
 */
BemConfig.prototype.configs = function(isSync) {
    var options = this._options,
        cwd = options.cwd,
        rcOpts = {
            defaults: options.defaults && JSON.parse(JSON.stringify(options.defaults)),
            cwd: cwd,
            fsRoot: options.fsRoot,
            fsHome: options.fsHome,
            name: options.name || 'bem',
            extendBy: options.extendBy
        };

    if (options.pathToConfig) {
        rcOpts.argv = { config: options.pathToConfig };
    }

    var plugins = [require('./plugins/resolve-level')].concat(options.plugins || []);

    if (isSync) {

        var configs = extendConfigsPathByLayer(this._configs || (this._configs = rc.sync(rcOpts)));

        this._root = getConfigsRootDir(configs);

        return plugins.reduce(function(acc, plugin) {
            return acc.map(function(config) {
                return plugin(config, acc, options);
            });
        }, configs);
    }

    var _this = this;

    return (this._configs ? Promise.resolve(this._configs) : rc(rcOpts)).then(function(cfgs) {
        extendConfigsPathByLayer(_this._configs || (_this._configs = cfgs));

        _this._root = getConfigsRootDir(cfgs);

        return plugins.reduce(
            function(cfgsPromise, plugin) {
                return cfgsPromise.then(function(configs_) {
                    return Promise.all(configs_.map(function(config) {
                        return new Promise(function(resolve) {
                            plugin(config, configs_, options, resolve);
                        });
                    }));
                });
            },
            Promise.resolve(cfgs));
    });
};

/**
 * Returns project root
 * @returns {Promise}
 */
BemConfig.prototype.root = function() {
    if (this._root) {
        return Promise.resolve(this._root);
    }

    var _this = this;
    return this.configs().then(function() {
        return _this._root;
    });
};

/**
 * Returns merged config
 * @returns {Promise}
 */
BemConfig.prototype.get = function() {
    return this.configs().then(function(configs) {
        return merge(configs);
    });
};

/**
 * Resolves config for given level
 * @param {String} pathToLevel - level path
 * @returns {Promise}
 */
BemConfig.prototype.level = function(pathToLevel) {
    var _this = this;

    return this.configs()
        .then(function(configs) {
            return getLevelByConfigs(
                pathToLevel,
                _this._options,
                configs,
                _this._root);
        });
};

/**
 * Returns config for given library
 * @param {String} libName - library name
 * @returns {Promise}
 */
BemConfig.prototype.library = function(libName) {
    return this.get()
        .then(function(config) {
            var libs = config.libs,
                lib = libs && libs[libName];

            if (lib !== undefined && typeof lib !== 'object') {
                return Promise.reject('Invalid `libs` format');
            }

            var cwd = lib && lib.path || path.resolve('node_modules', libName);

            return new Promise(function(resolve, reject) {
                fs.exists(cwd, function(doesExist) {
                    if (!doesExist) {
                        return reject('Library ' + libName + ' was not found at ' + cwd);
                    }

                    resolve(cwd);
                })
            });
        })
        .then(cwd => new BemConfig({ cwd }));
};

/**
 * Returns map of settings for each of level
 * @returns {Promise}
 */
BemConfig.prototype.levelMap = function() {
    var _this = this;

    return this.get().then(function(config) {
        var projectLevels = config.levels || [],
            libNames = config.libs ? Object.keys(config.libs) : [];

        return Promise.all(libNames.map(function(libName) {
            return _this.library(libName).then(function(bemLibConf) {
                return bemLibConf.get().then(function(libConfig) {
                    return libConfig.levels;
                });
            });
        })).then(function(libLevels) {
            var allLevels = [].concat.apply([], libLevels).concat(projectLevels);

            return allLevels.reduce((res, lvl) => {
                res[lvl.path] = merge(res[lvl.path] || {}, lvl);
                return res;
            }, {});
        });
    });
};

BemConfig.prototype.levels = function(setName) {
    var _this = this;

    return this.get().then(function(config) {
        var levels = config.levels || [],
            sets = config.sets || {};

        if (!sets[setName]) { return []; }

        var resolvedSets = resolveSets(sets),
            set = resolvedSets[setName];

        if (!set || !set.length) { return []; }

        // TODO: uniq
        return Promise.all(set.map(chunk => {
            if (chunk.library) {
                return _this.library(chunk.library).then(libConfig => {
                    assert(libConfig, 'Library `' + chunk.library + '` was not found');

                    return libConfig.levels(chunk.set || setName);
                });
            }

            if (chunk.set) {
                return _this.levels(chunk.set);
            }

            var level = levels.find(lvl => {
                return lvl.layer === chunk.layer;
            }) || {};

            var levelPath = level.path || (level.layer + '.blocks'); // ← TODO: Use @bem/sdk.file.naming

            return _this.levelMap().then(levelsMap => levelsMap[levelPath]);
        })).then(flatten);
    });
};

/**
 * Returns config for given module name
 * @param {String} moduleName - name of module
 * @returns {Promise}
 */
BemConfig.prototype.module = function(moduleName) {
    return this.get().then(function(config) {
        var modules = config.modules;

        return modules && modules[moduleName];
    });
};

/**
 * Returns project root
 * @returns {String}
 */
BemConfig.prototype.rootSync = function() {
    if (this._root) {
        return this._root;
    }

    this.configs(true);
    return this._root;
};

/**
 * Returns merged config synchronously
 * @returns {Object}
 */
BemConfig.prototype.getSync = function() {
    return merge(this.configs(true));
}

/**
 * Resolves config for given level synchronously
 * @param {String} pathToLevel - level path
 * @returns {Object}
 */
BemConfig.prototype.levelSync = function(pathToLevel) {
    // TODO: cache
    return getLevelByConfigs(
        pathToLevel,
        this._options,
        this.configs(true),
        this._root);
};

/**
 * Returns config for given library synchronously
 * @param {String} libName - library name
 * @returns {Object}
 */
BemConfig.prototype.librarySync = function(libName) {
    var config = this.getSync(),
        libs = config.libs,
        lib = libs && libs[libName];

    assert(lib === undefined || typeof lib === 'object', 'Invalid `libs` format');

    var cwd = lib && lib.path || path.resolve('node_modules', libName);

    assert(fs.existsSync(cwd), 'Library ' + libName + ' was not found at ' + cwd);

    return new BemConfig({ cwd });
};

/**
 * Returns map of settings for each of level synchronously
 * @returns {Object}
 */
BemConfig.prototype.levelMapSync = function() {
    var config = this.getSync(),
        projectLevels = config.levels || [],
        libNames = config.libs ? Object.keys(config.libs) : [];

    var libLevels = [].concat.apply([], libNames.map(function(libName) {
        var bemLibConf = this.librarySync(libName),
            libConfig = bemLibConf.getSync();

        return libConfig.levels;
    }, this));

    var allLevels = [].concat(libLevels, projectLevels); // hm.
    return allLevels.reduce(function(acc, level) {
        acc[level.path] = level;
        return acc;
    }, {});
};

BemConfig.prototype.levelsSync = function(setName) {
    var _this = this,
        config = this.getSync(),
        levels = config.levels || [],
        levelsMap = this.levelMapSync(),
        sets = config.sets || {};

    if (!sets[setName]) { return []; }

    var resolvedSets = resolveSets(sets),
        set = resolvedSets[setName];

    // TODO: uniq
    return set.reduce((acc, chunk) => {
        if (chunk.library) {
            var libConfig = _this.librarySync(chunk.library);

            assert(libConfig, 'Library `' + chunk.library + '` was not found');

            return acc.concat(libConfig.levelsSync(chunk.set));
        }

        if (chunk.set) {
            return acc.concat(_this.levelsSync(chunk.set));
        }

        var level = levels.find(lvl => {
            return lvl.layer === chunk.layer;
        }) || {};

        var levelPath = level.path || (level.layer + '.blocks'); // TODO: Use `@bem/sdk.file.naming`

        acc.push(levelsMap[levelPath]);

        return acc;
    }, []);
};

/**
 * Returns config for given module name synchronously
 * @param {String} moduleName - name of module
 * @returns {Object}
 */
BemConfig.prototype.moduleSync = function(moduleName) {
    var modules = this.getSync().modules;

    return modules && modules[moduleName];
};

function getConfigsRootDir(configs) {
    var rootCfg = [].concat(configs).reverse().find(function(cfg) { return cfg.root && cfg.__source; });
    if (rootCfg) { return path.dirname(rootCfg.__source); }
}

function getLevelByConfigs(pathToLevel, options, allConfigs, root) {
    var absLevelPath = path.resolve(root || options.cwd, pathToLevel),
        levelOpts = {},
        commonOpts = {};

    for (var i = allConfigs.length - 1; i >= 0; i--) {
        var conf = allConfigs[i],
            levels = conf.levels || [];

        commonOpts = merge({}, conf, commonOpts);

        for (var j = 0; j < levels.length; j++) {
            var level = levels[j];

            if (level === undefined || level.path !== absLevelPath) { continue; }

            // works like deep extend but overrides arrays
            levelOpts = merge({}, level, levelOpts);
        }

        if (conf.root) { break; }
    }

    levelOpts = merge(commonOpts, levelOpts);

    delete levelOpts.__source;
    delete levelOpts.path;
    delete levelOpts.levels;
    delete levelOpts.root;

    return Object.keys(levelOpts).length ? levelOpts : undefined;
}

/**
 * Modifies passed configs set — adds path property if empty
 *
 * @param {Array<{layer: String, path: ?String}>} configs
 * @returns {Array<{layer: String, path: String}>}
 */
function extendConfigsPathByLayer(configs) {
    configs.forEach(config => {
        config.levels && config.levels.forEach(level => {
            level.path || (level.path = level.layer + '.blocks');
        });
    });

    return configs;
}

module.exports = function(opts) {
    return new BemConfig(opts);
};
