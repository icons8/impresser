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
  httpProxy = require('http-proxy'),
  logger = require('./logger')
  ;

module.exports = Server;

function Server(options, storage, htmlFilters) {
  options = options || {};

  this.options = options;
  this.setBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  this.port = options.serverPort || DEFAULT_SERVER_PORT;

  this.forceAllowed = options.forceAllowed;
  this.proxy = options.proxy || typeof options.proxy == 'undefined';
  this.frontend = options.frontend || typeof options.frontend == 'undefined';
  this.content = options.content || typeof options.content == 'undefined';

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
    var
      self = this;

    this.instance.use(responseTime());
    this.instance.use(function(req, res, next) {
      var
        requestTime = Date.now(),
        acceptEncoding = req.headers['accept-encoding'] || '';

      req.on('error', function(error) {
        logger.error('REQUEST ERROR', error);
      });
      res.on('error', function(error) {
        logger.error('RESPONSE ERROR', error);
      });

      res.send = function(code, content, headers, contentType) {
        var
          stream,
          deflated = /\bdeflate\b/i.test(acceptEncoding),
          gzipped = /\bgzip\b/i.test(acceptEncoding);

        if (typeof code != 'number') {
          headers = content;
          content = code;
          code = 200;
        }

        if (!self.content) {
          content = null;
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
        else if (/(text|xml|html)/i.test(contentType)) {
          res.setHeader('Content-Type', contentType);
        }
        else {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        res.statusCode = code;

        if (!deflated && !gzipped || !content) {
          res.end(content);
          end();
        }
        else {
          stream = new Readable;
          stream.on('end', end);
          stream.on('error', function(error) {
            logger.error('RESPONSE DATA ERROR', error);
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
          logger.log('Response Time:', Date.now() - requestTime, 'ms');
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
        force = false,
        fragment = null;

      if (req.method.toUpperCase() != 'GET') {
        next();
        return;
      }

      parsedUrl = urlLib.parse(req.url);
      query = qs.parse(parsedUrl.query || '');

      function performForce(value) {
        force = /^\s*(on|yes|y|true)\s*/i.test(value);
      }

      if (!self.frontend) {
        if (/^\/https?:\/\//.test(parsedUrl.pathname)) {
          performForce(query.force || query['impress-force'] || query['impress_force']);
          parsedUrl = urlLib.parse(decodeURIComponent(parsedUrl.pathname.slice(1)));
          baseUrl = parsedUrl.protocol + '//' + parsedUrl.host;
          if (query.hasOwnProperty('_escaped_fragment_')) {
            fragment = query._escaped_fragment_;
          }
          query = qs.parse(parsedUrl.query || '');
        }
        else {
          if (parsedUrl.pathname != '/') {
            logger.error('Unresolved path', parsedUrl.pathname);
            res.send(404);
            return;
          }
          performForce(query.force || query['impress-force'] || query['impress_force']);

          parsedUrl = urlLib.parse(query.url || query.uri || '/');
          if (parsedUrl.protocol && parsedUrl.host) {
            baseUrl = parsedUrl.protocol + ( parsedUrl.slashes ? '//' : '/' ) + parsedUrl.host;
          }
          query = qs.parse(parsedUrl.query || '');
        }
      }
      else {
        performForce(req.headers['x-impress-force'] || req.headers['impress-force']);
      }

      url = path.normalize(parsedUrl.pathname);

      if (!/^[/\\]/.test(url)) {
        url = path.sep + url;
      }

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

      if (self.proxy) {
        if (/\.(json|js|css|xml|less|png|jpe?g|gif|svg|pdf|ico|mp3|wmv|avi|mpe?g|tiff?|wav|mov|mp4|m4a|swf|flv|m4v|ttf|woff2?|eot)$/i.test(parsedUrl.pathname)) {
          next();
          return;
        }
      }

      if (self.forceAllowed && force) {
        perform();
      }
      else {
        self.storage.get(absoluteUrl, function(err, result) {
          if (err) {
            logger.error('Error storage: Could not get stored page', absoluteUrl, err);
          }
          else if (result) {
            logger.log('CACHE', result.httpStatusCode, absoluteUrl);
            res.send(result.httpStatusCode, result.content, result.httpHeaders, result.contentType);
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
              logger.error(message, err);

              if (deferred.getRemainedTimeout() <= 0) {
                res.send(504);
              }
              else {
                res.send(503);
              }

              return;
            }
            res.send(result.httpStatusCode, result.content, result.httpHeaders, result.contentType);

            self.storage.put(result, function(err) {
              if (err) {
                logger.error('Error storage: Could not store page', absoluteUrl, err);
              }
            });

            logger.log('Perform time:', result.performTime, 'ms', 'Execution time:', result.executionTime, 'ms');
          });
          deferred.postResolve(function() {
            deferred.destroy();
            deferred = undefined;
          });
        }
        else {
          message = 'QUEUE LIMIT "' + self.queue.maxSize + '" page "' + absoluteUrl + '" discarded.';
          logger.error(message);
          res.send(502, message);
        }
      }

    });
  },

  _registerProxyServer: function() {
    var
      proxy;

    if (!this.proxy) {
      return;
    }

    proxy = httpProxy.createProxyServer({
      target: this.baseUrl,
      changeOrigin: true
    });

    this.instance.use(function(req, res) {
      logger.log('Proxy url:', req.url, 'method:', req.method);
      proxy.web(req, res, function(err) {
        logger.error('PROXY ERROR for url', req.url, 'and method', req.method, 'with message', err);
      });
    });
    proxy.on('error', function(error) {
      logger.error('PROXY ERROR', error);
    });
  },

  _startServer: function() {
    http.createServer(this.instance).listen(this.port);
    logger.log('Server created on port', this.port);
    this.instance.on('error', function(error) {
      logger.error('SERVER INSTANCE ERROR', error);
    });
  },

  _createQueue: function() {
    this.queue = new ImpressQueue(this.options, this.htmlFilters);
    this.queue.prepare();
  }

};
