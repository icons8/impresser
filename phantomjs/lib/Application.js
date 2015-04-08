const
  OK_EXIT_CODE = 0
  ;

var
  Page = require('./Page');

module.exports = Application;

function Application(options) {
  this.options = options || {};
  this.url = this.options.url || '';
  this._init();
}

Application.prototype = {

  _init: function() {
    this.page = new Page(this.url, this.options);
    this._initPageListeners();
  },

  _initPageListeners: function() {
    var
      self = this,
      page = this.page;

    page.on('exit', function(result) {
      self.send(result);
      self.exit(OK_EXIT_CODE);
    });

  },

  exit: function(code) {
    phantom.exit(code);
  },

  send: function(result) {
    console.log(JSON.stringify(result));
  },

  run: function() {
    this.page.open();
  }

};

