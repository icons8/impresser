const
  DEFAULT_CONFIG_FILENAME = 'impressconfig.js';

var
  Server = require('./Server'),
  merge = require('./merge'),
  path = require('path'),
  fs = require('fs');

module.exports = Application;

function Application(options) {
  this.options = options || {};

  this._server = null;
  this._storage = null;
  this._htmlFilters = [];
  this._init();
}

Application.prototype = {

  _init: function() {
    if (this.options.config) {
      this.options = merge(this._getParsedConfig(this.options.config), this.options);
    }
    this.performConfigFile(DEFAULT_CONFIG_FILENAME, true);
  },

  _getParsedConfig: function(/* ...configs */) {
    var
      optional = false,
      args,
      result = {};

    args = Array.prototype.slice.apply(arguments);
    if (typeof args[args.length - 1] == 'boolean') {
      optional = args.pop();
    }

    args.forEach(function(config) {
      if (!Array.isArray(config)) {
        config = [config];
      }

      config.forEach(function(config) {
        if (typeof config != 'string') {
          _merge(config);
          return;
        }
        try {
          _merge(
            JSON.parse(
              fs.readFileSync(config)
            )
          );
        }
        catch(error) {
          if ( !(optional && error instanceof Error && error.code == 'ENOENT') ) {
            console.error('Could not parse config file "'+config+'"', error);
          }
        }
      });
    });

    function _merge(config) {
      if (config && typeof config == 'object' && !Array.isArray(config)) {
        merge(result, config);
      }
      else {
        console.warn('Invalid config data:', JSON.stringify(config));
      }
    }
    return result;
  },

  performConfigFile: function(fileName, optional) {
    var
      configurator;
    try {
      configurator = require(path.resolve(fileName))
    }
    catch(error) {
      if (!optional || error.code != 'MODULE_NOT_FOUND') {
        console.error(error);
      }
      return;
    }
    try {
      configurator(this);
    }
    catch(error) {
      console.error('Error in configuration file', error);
    }
  },

  addConfig: function(/* ...configs */) {
    merge(
      this.options,
      this._getParsedConfig.apply(
        this,
        Array.prototype.slice.call(arguments)
      )
    );
    return this;
  },

  addBlockedResources: function(/* ...blockedResources */) {
    var
      self = this,
      blockedResources;

    blockedResources = this.options.blockedResources = this.options.blockedResources || [];
    if (!Array.isArray(this.options.blockedResources)) {
      this.options.blockedResources = [this.options.blockedResources];
    }

    Array.prototype.slice.apply(arguments)
      .forEach(function(resource) {
        if (typeof resource == 'string') {
          blockedResources.push(resource);
        }
        else if (Array.isArray(resource)) {
          self.addBlockedResources.apply(
            self,
            resource
          );
        }
        else if (resource && typeof resource == 'object' && typeof resource.getResources == 'function') {
          self.addBlockedResources(resource.getResources());
        }
      });

    return this;
  },

  addHtmlFilters: function(/* ...filters */) {

    Array.prototype.push.apply(
      this._htmlFilters,
      Array.prototype.slice.apply(arguments)
    );

    return this;
  },

  addStorage: function(storage) {
    this._storage = storage;
  },

  run: function() {
    this._server = new Server(
      this.options,
      this._storage,
      this._htmlFilters
    );
    this._server.run();
  }

};