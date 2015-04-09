var
  Shell = require('./Shell'),
  Page = require('./Page'),
  Server = require('./Server'),
  inherit = require('./inherit'),
  EventEmitter = require('./EventEmitter');

module.exports = Application;

function Application(options) {
  EventEmitter.call(this);

  this.options = options || {};
  this._init();
}

inherit(Application, EventEmitter, {


  _initPage: function() {
    var
      page;

    page = new Page(this.options);
    page.on('exit', function(result) {
      Shell.output(JSON.stringify(result));
      Shell.exit();
    });

    this.on('run', function() {
      page.open();
    });
  },

  _initServer: function() {
    var
      server;

    server = new Server(this.options);
    this.on('run', function() {
      server.run();
    });
  },

  _init: function() {
    if (this.options.url) {
      this._initPage();
    }
    else {
      this._initServer();
    }
  },

  run: function() {
    this.emit('run');
  }

});


