# bem-config

## Usage

```js
var bemConfig = require('bem-config');
var optionalConfig = { plugins: { create: { techs: ['styl', 'browser.js'] } } };
var projectConfig = bemConfig(options); // returns promise
```

### options
All options are optional:

* `name` // 'bem'
* `projectRoot` // process.cwd()
* `config` // extends found configs with this object
* `argv` // custom path to config on FS via command line argument `--config` (defaults to `null`)

## API

### get

```js
var config = require('bem-config')();
config.get().then(function(conf) {
    console.log(conf); // config is a merge of CLI args + optionalConfig + all configs found by rc
});
```

### level

```js
var config = require('bem-config')();
config.level('path/to/level').then(function(levelConf) {
    console.log(levelConf); // merged level config
});
```

### library

```js
var config = require('bem-config')();
config.library('bem-tools').then(function(libConf) {
    console.log(libConf); // library config
});
```

### levelMap

```js
var config = require('bem-config')();
config.module('bem-tools').then(function(bemToolsConf) {
    console.log(bemToolsConf); // merged config for required module
});
```

### module

```js
var config = require('bem-config')();
config.module('bem-tools').then(function(bemToolsConf) {
    console.log(bemToolsConf); // merged config for required module
});
```

### configs

```js
var config = require('bem-config')();
config.configs().then(function(configs) {
    console.log(configs); // all found configs from all dirs
});
```

## Config example

```js
{
    "root": true,
    "levels": {
        "path/to/level": {
            "scheme": "nested"
        }
    },
    "libs": {
        "libName": {
            "path": "path/to/lib"
        }
    },
    "sets": {
        "setName": ["level1", "level2"]
    },
    "modules": {
        "bem-tools": {
            "plugins": {
                "create": {
                    "techs": [
                        "css", "js"
                    ],
                    "templateFolder": "/Users/tadatuta/Sites/bem/bem-tools-create/templates",
                    "templates": {
                        "js-ymodules": "/Users/tadatuta/Sites/bem/bem-tools-create/templates/js"
                    },
                    "techsTemplates": {
                        "js": "js-ymodules"
                    },
                    "levels": {
                        "path/to/level": {
                            "techs": ["bemhtml.js", "trololo.olo"]
                        }
                    }
                }
            }
        },
        "bem-libs-site-data": {
            "someOption": "someValue"
        }
    }
}
```

`levels` override common options.
