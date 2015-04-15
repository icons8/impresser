var
  connect = require('connect'),
  responseTime = require('response-time'),
  http = require('http'),
  ImpressQueue = require('./impress/Queue'),
  MemoryStorage = require('./storage/MemoryStorage'),
  path = require('path'),
  urlLib = require('url'),
  qs = require('qs'),
  httpProxy = require('http-proxy')
  ;

module.exports = Server;

function Server(options, storage, htmlFilters) {
  options = options || {};

  this.options = options;
  this.setBaseUrl(options.baseUrl || 'http://icons8.com');
  this.port = options.serverPort || 8497;

  this.storage = storage;
  this.htmlFilters = htmlFilters;
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

    this._registerServerExtension();
    this._registerImpressPerformer();
    this._registerProxyServer();
    this._createQueue();
    this._startServer();
    this._initStorage();
  },

  _initStorage: function() {
    var
      storage = this.storage;

    if ( !(storage && typeof storage == 'object' && typeof storage.get == 'function' && typeof storage.put == 'function') ) {
      this.storage = new MemoryStorage(this.options);
    }
  },

  _registerServerExtension: function() {
    this.instance.use(responseTime());
    this.instance.use(function(req, res, next) {
      var
        requestTime = Date.now();

      req.on('error', function(error) {
        console.error('REQUEST ERROR', error);
      });
      res.on('error', function(error) {
        console.error('RESPONSE ERROR', error);
      });

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
        console.log('Response Time:', Date.now() - requestTime, 'ms');
      };
      next();
    });
  },

  _registerImpressPerformer: function() {
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
        stored,
        time,
        fragment = null;

      if (req.method.toUpperCase() != 'GET') {
        next();
        return;
      }

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

      if (self.options.frontend || typeof self.options.frontend == 'undefined') {
        if (/\.(ico|css|js|jpe?g|gif|png|svg|xml|json)/i.test(parsedUrl.pathname)) {
          next();
          return;
        }
      }

      self.storage.get(absoluteUrl, function(err, result) {
        if (err) {
          console.error('Error storage: Could not get stored page', absoluteUrl);
        }
        else if (result) {
          res.send(result.httpStatusCode, result.content);
          return;
        }

        if (!self.queue.hasLimit()) {
          deferred = self.queue.add(absoluteUrl);

          deferred.promise(function(err, result) {
            if (err) {
              message = 'FAIL page "' + absoluteUrl + '" could not be impressed.';
              console.error(message, err);
              res.send(503);
              return;
            }
            res.send(result.httpStatusCode, result.content);

            self.storage.put(result, function(err) {
              if (err) {
                console.error('Error storage: Could not store page', absoluteUrl, err);
              }
            });

            console.log('Perform time:', result.performTime, 'ms', 'Execution time:', result.executionTime, 'ms');
          });
          deferred.postResolve(function() {
            deferred.destroy();
            deferred = undefined;
          });
        }
        else {
          message = 'QUEUE LIMIT "' + self.queue.maxSize + '" page "' + absoluteUrl + '" discarded.';
          console.error(message);
          res.send(501, message);
        }

      });

    });
  },

  _registerProxyServer: function() {
    var
      proxy;

    if (!this.options.proxy && typeof this.options.proxy != 'undefined') {
      return;
    }

    proxy = httpProxy.createProxyServer({
      target: this.baseUrl,
      changeOrigin: true
    });

    this.instance.use(function(req, res) {
      console.log('Proxy url:', req.url, 'method:', req.method);
      proxy.web(req, res, function(err) {
        console.error('PROXY ERROR for url', req.url, 'and method', req.method, 'with message', err);
      });
    });
    proxy.on('error', function(error) {
      console.error('PROXY ERROR', error);
    });
  },

  _startServer: function() {
    http.createServer(this.instance).listen(this.port);
    console.log('Server created on port', this.port);
    this.instance.on('error', function(error) {
      console.error('SERVER INSTANCE ERROR', error);
    });
  },

  _createQueue: function() {
    this.queue = new ImpressQueue(this.options, this.htmlFilters);
    this.queue.init();
  }

};
