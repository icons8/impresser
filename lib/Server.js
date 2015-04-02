var
  connect = require('connect'),
  http = require('http'),
  responseTime = require('response-time'),
  ImpressQueue = require('./ImpressQueue')
  ;

module.exports = Server;

function Server(options) {
  options = options || {};

  this.options = options;
  this.setBaseUrl(options.baseUrl || 'http://icons8.com');
  this.port = options.serverPort || 8497;
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
        deferred,
        url,
        message,
        absoluteUrl;

      url = req.url;
      absoluteUrl = self.baseUrl + url;

      if (/^\/favicon\.ico$/i.test(url)) {
        next();
      }

      if (!self.impressQueue.hasLimit()) {
        deferred = self.impressQueue.add(absoluteUrl);

        deferred.promise(function(err, content, warn) {
          if (err) {
            message = 'FAIL page "' + absoluteUrl + '" could not be impressed.';
            console.error(message, err);
            res.send(501, [message, err].join('\n'));
            return;
          }
          if (warn) {
            console.error('ERROR page "' + absoluteUrl + '" impressed with errors.', warn);
          }
          res.send(String(content));
        });
        deferred.postResolve(function() {
          deferred.destroy();
          deferred = undefined;
        });
      }
      else {
        message = 'QUEUE LIMIT page "' + absoluteUrl + '" discarded.';
        console.error(message);
        res.send(501, message);
      }

    });
  },

  _startServer: function() {
    http.createServer(this.instance).listen(this.port);
  },

  _createImpressQueue: function() {
    this.impressQueue = new ImpressQueue(this.options);
  }

};
