var
  connect = require('connect'),
  http = require('http'),
  responseTime = require('response-time'),
  ImpressQueue = require('./ImpressQueue'),
  path = require('path')
  ;

module.exports = Server;

function Server(options) {
  options = options || {};

  this.setBaseUrl(options.baseUrl || 'http://icons8.com');
  this.port = options.port || 8497;
}

Server.prototype = {

  setBaseUrl: function(baseUrl) {
    baseUrl = String(baseUrl || '').trim();
    while( baseUrl.lastIndexOf('/') == baseUrl.length-1 ) {
      baseUrl = baseUrl.slice(0, -1);
    }
    this.baseUrl = baseUrl;
  },

  run: function() {

    this.instance = connect();
    this._registerResponseTime();
    this._registerResponseExtension();
    this._registerImpressManager();
    this._createImpressQueue();
    this._startServer();
  },

  _registerResponseTime: function() {
    this.instance.use(responseTime());
  },

  _registerResponseExtension: function() {
    this.instance.use(function(req, res, next) {
      res.send = function(code, content) {
        if (typeof code != 'number') {
          content = code;
          code = 200;
        }
        if (typeof content == 'undefined' || content === null) {
          content = '';
        }
        if (typeof content != 'string') {
          content = JSON.stringify(content);
          res.setHeader('Content-Type', 'application/json');
        }
        else {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        res.statusCode = code;
        res.end(content);
      };
      next();
    });
  },

  _registerImpressManager: function() {
    var
      self = this
      ;

    this.instance.use(function(req, res, next) {
      var
        impress,
        url,
        ext,
        message;

      url = req.url;
      ext = path.extname(url);

      if (/^\.(ico|png|jpe?g|xml|css|js|svg|gif)$/i.test(ext)) {
        next();
      }

      if (!self.impressQueue.hasLimit()) {
        impress = self.impressQueue.add(self.baseUrl + url);

        impress(function(err, content) {
          if (err) {
            message = 'Page could not be impressed\n' + err;
            console.error(message);
            res.send(501, message);
            return;
          }
          res.send(String(content));
        });
      }
      else {
        message = 'Queue Limit';
        console.warn(message);
        res.send(501, message);
      }

    });
  },

  _startServer: function() {
    http.createServer(this.instance).listen(this.port);
  },

  _createImpressQueue: function() {
    this.impressQueue = new ImpressQueue();
  }

};
