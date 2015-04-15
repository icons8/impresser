const
  DEFAULT_CONFIG_FILENAME = 'impressconfig.js';

var
  Server = require('./Server'),
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
    this._performConfig();
    this._server = new Server(
      this.options,
      this._storage,
      this._htmlFilters
    );
  },

  _performConfig: function() {
    var
      configurator;
    try {
      configurator = require(path.resolve(DEFAULT_CONFIG_FILENAME))
    }
    catch(error) {
      if (error.code != 'MODULE_NOT_FOUND') {
        console.error(error);
      }
      return;
    }
    configurator(this);
  },

  addConfig: function(/* ...configs */) {
    var
      self = this,
      optional = false,
      args;

    args = Array.prototype.slice.apply(arguments);
    if (typeof args[args.length - 1] == 'boolean') {
      optional = args.pop();
    }

    args.forEach(perform);

    function perform(config) {
      if (!Array.isArray(config)) {
        config = [config];
      }

      config.forEach(function(config) {
        if (typeof config != 'string') {
          merge(config);
          return;
        }
        try {
          merge(
            JSON.parse(
              fs.readFileSync(config)
            )
          );
        }
        catch(error) {
          if ( !(optional && error instanceof Error && error.code == 'ENOENT') ) {
            throw error;
          }
        }
      });
    }

    function merge(config) {
      if (!config || typeof config != 'object') {
        return;
      }
      _merge(self.options, config);

      function _merge(to, from) {
        if (!to || !from || typeof to != 'object' || typeof from != 'object' || Array.isArray(to) || Array.isArray(from)) {
          return from;
        }
        Object.keys(from).forEach(function(key) {
          if (to.hasOwnProperty(key)) {
            to[key] = _merge(to[key], from[key]);
          }
          else {
            to[key] = from[key];
          }
        });
        return to;
      }
    }

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
    this._server.run();
  }

};