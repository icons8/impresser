const
  DEFAULT_IMPRESS_CONFIG_FILENAME = 'impressconfig.js';

var
  Server = require('./Server'),
  path = require('path');

module.exports = Application;

function Application(options) {
  this.options = options || {};

  this._server = null;
  this._init();
}

Application.prototype = {

  _init: function() {
    this._performImpressConfig();
    this._server = new Server(this.options);
  },

  _performImpressConfig: function() {
    var
      configurator,
      result;
    try {
      configurator = require(path.resolve(DEFAULT_IMPRESS_CONFIG_FILENAME))
    }
    catch(error) {
      if (error.code != 'MODULE_NOT_FOUND') {
        console.error(error);
      }
      return;
    }
    result = configurator(this.options);
    if (result && typeof result == 'object') {
      this.options = result;
    }
  },

  run: function() {
    this._server.run();
  }

};