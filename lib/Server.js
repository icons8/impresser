var
  connect = require('connect'),
  http = require('http'),
  responseTime = require('response-time'),
  ImpressQueue = require('./ImpressQueue'),
  path = require('path'),
  urlLib = require('url'),
  qs = require('qs')
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
        absoluteUrl,
        baseUrl = self.baseUrl || '',
        parsedUrl,
        query,
        queryString,
        fragment = null;

      parsedUrl = urlLib.parse(req.url);
      query = qs.parse(parsedUrl.query || '');
      url = path.normalize(parsedUrl.pathname);

      if (query.hasOwnProperty('_escaped_fragment_')) {
        fragment = query._escaped_fragment_;
        delete query._escaped_fragment_;
      }

      queryString = qs.stringify(query);
      if (queryString) {
        url += '?' + queryString;
      }

      if (fragment) {
        url += '#!' + fragment;
      }

      if (baseUrl.lastIndexOf('/') == baseUrl.length - 1) {
        baseUrl = baseUrl.slice(0, -1);
      }
      absoluteUrl = baseUrl + url;

      if (/^\/favicon\.ico$/i.test(url)) {
        next();
        return;
      }
      if (!self.impressQueue.hasLimit()) {
        deferred = self.impressQueue.add(absoluteUrl);

        deferred.promise(function(err, content, warn) {
          if (err || !content) {
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
        message = 'QUEUE LIMIT "' + self.impressQueue.maxSize + '" page "' + absoluteUrl + '" discarded.';
        console.error(message);
        res.send(501, message);
      }

    });
  },

  _startServer: function() {
    http.createServer(this.instance).listen(this.port);
    console.log('Server created on port', this.port);
  },

  _createImpressQueue: function() {
    this.impressQueue = new ImpressQueue(this.options);
  }

};
