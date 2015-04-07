const
  OK_EXIT_CODE = 0,
  ERROR_EXIT_CODE = 1,
  PAGE_NOT_FOUND_EXIT_CODE = 2
  ;

var
  Page = require('./Page');

module.exports = Application;

function Application(url) {
  this.url = url || '';
  this._init();
}

Application.EXIT_CODE = {
  OK: OK_EXIT_CODE,
  ERROR: ERROR_EXIT_CODE,
  PAGE_NOT_FOUND: PAGE_NOT_FOUND_EXIT_CODE
};

Application.prototype = {

  _init: function() {
    this.page = new Page(this.url);
    this._initPageListeners();
  },

  _initPageListeners: function() {
    var
      self = this,
      page = this.page;

    page.on('Ok', function(result) {
      self.send(result);
      self.exit(Application.EXIT_CODE.OK);
    });

    page.on('Error', function(result) {
      self.send(result);
      self.exit(Application.EXIT_CODE.ERROR);
    });

    page.on('PageNotFound', function(result) {
      self.send(result);
      self.exit(Application.EXIT_CODE.PAGE_NOT_FOUND);
    });

  },

  exit: function(code) {
    phantom.exit(code);
  },

  send: function(result) {
    result = result || '';
    console.log(result);
  },

  run: function() {
    this.page.open();
  }

};

