const
  DEFAULT_BASE_URL = 'http://icons8.com',
  DEFAULT_SERVER_PORT = 8497;

var
  connect = require('connect'),
  responseTime = require('response-time'),
  http = require('http'),
  ImpressQueue = require('./impress/Queue'),
  MemoryStorage = require('./storage/MemoryStorage'),
  NullStorage = require('./storage/NullStorage'),
  path = require('path'),
  zlib = require('zlib'),
  stream = require('stream'),
  Readable = stream.Readable,
  urlLib = require('url'),
  qs = require('querystring'),
  httpProxy = require('http-proxy')
  ;

module.exports = Server;

function Server(options, storage, htmlFilters) {
  options = options || {};

  this.options = options;
  this.setBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  this.port = options.serverPort || DEFAULT_SERVER_PORT;

  this.forceHeader = options.impressForceHeader;

  this.storage = storage;
  this.htmlFilters = htmlFilters;

  this._initStorage();
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
  },

  _initStorage: function() {
    var
      storage = this.storage;

    if ( !(storage && typeof storage == 'object' && typeof storage.get == 'function' && typeof storage.put == 'function') ) {
      if (typeof this.options.storage == 'boolean' && !this.options.storage) {
        this.storage = new NullStorage(this.options);
      }
      else {
        this.storage = new MemoryStorage(this.options);
      }
    }

  },

  _registerServerExtension: function() {
    this.instance.use(responseTime());
    this.instance.use(function(req, res, next) {
      var
        requestTime = Date.now(),
        acceptEncoding = req.headers['accept-encoding'] || '';

      req.on('error', function(error) {
        console.error('REQUEST ERROR', error);
      });
      res.on('error', function(error) {
        console.error('RESPONSE ERROR', error);
      });

      res.send = function(code, content, headers) {
        var
          stream,
          deflated = /\bdeflate\b/i.test(acceptEncoding),
          gzipped = /\bgzip\b/i.test(acceptEncoding);

        if (typeof code != 'number') {
          headers = content;
          content = code;
          code = 200;
        }
        if (typeof content == 'undefined' || content === null) {
          content = '';
        }
        if (headers && typeof headers == 'object') {
          if (headers) {
            Object.keys(headers).forEach(function(header) {
              res.setHeader(header, headers[header]);
            });
          }
        }
        if (typeof content != 'string') {
          content = JSON.stringify(content);
          res.setHeader('Content-Type', 'application/json');
        }
        else {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        res.statusCode = code;

        if (!deflated && !gzipped) {
          res.end(content);
          end();
        }
        else {
          stream = new Readable;
          stream.on('end', end);
          stream.on('error', function(error) {
            console.error('RESPONSE DATA ERROR', error);
          });
          stream._read = function() {
            this.push(content);
            this.push(null);
          };
          if (gzipped) {
            res.setHeader('Content-Encoding', 'gzip');
            stream.pipe(zlib.createGzip()).pipe(res);
          }
          else {
            res.setHeader('Content-Encoding', 'deflate');
            stream.pipe(zlib.createDeflate()).pipe(res);
          }
        }

        function end() {
          console.log('Response Time:', Date.now() - requestTime, 'ms');
        }
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

      if ( self.forceHeader && /^\s*(on|yes|true)\s*/i.test(req.headers['x-impress-force'] || req.headers['impress-force']) ) {
        perform();
      }
      else {
        self.storage.get(absoluteUrl, function(err, result) {
          if (err) {
            console.error('Error storage: Could not get stored page', absoluteUrl, err);
          }
          else if (result) {
            res.send(result.httpStatusCode, result.content, result.httpHeaders);
            return;
          }
          perform();
        });
      }

      function perform() {
        if (!self.queue.hasLimit()) {
          deferred = self.queue.add(absoluteUrl);

          deferred.promise(function(err, result) {
            if (err) {
              message = 'FAIL page "' + absoluteUrl + '" could not be impressed.';
              console.error(message, err);
              res.send(503);
              return;
            }
            res.send(result.httpStatusCode, result.content, result.httpHeaders);

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
      }

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
