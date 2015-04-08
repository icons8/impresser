var
  connect = require('connect'),
  http = require('http'),
  responseTime = require('response-time'),
  ImpressQueue = require('./impress/ImpressQueue'),
  path = require('path'),
  urlLib = require('url'),
  qs = require('qs'),
  httpProxy = require('http-proxy'),
  PageNotFoundError = require('./error/PageNotFoundError')
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
    this._registerServerExtension();
    this._registerImpressPerformer();
    this._registerProxyServer();
    this._createImpressQueue();
    this._startServer();
  },

  _registerResponseTime: function() {
    this.instance.use(responseTime());
  },

  _registerServerExtension: function() {
    this.instance.use(function(req, res, next) {
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

      if (!self.impressQueue.hasLimit()) {
        deferred = self.impressQueue.add(absoluteUrl);

        deferred.promise(function(err, content, warn) {
          var
            statusCode;
          if (err instanceof PageNotFoundError) {
            res.send(404, 'Not Found');
            return;
          }
          if (err || !content) {
            message = 'FAIL page "' + absoluteUrl + '" could not be impressed.';
            console.error(message, err);
            res.send(501, [message, err].join('\n'));
            return;
          }
          if (warn) {
            console.error('ERROR page "' + absoluteUrl + '" impressed with errors.', warn);
          }
          statusCode = parseStatusCodeFromMeta(content);
          res.send(
            statusCode
              ? statusCode
              : 200,
            content
          );
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

    function parseStatusCodeFromMeta(content) {
      var
        metaMatch = content.match(/<meta[^>]*?(?:prerender|impress)-status-code[^>]*>/i),
        statusCodeMatch;

      if (metaMatch) {
        statusCodeMatch = metaMatch[0].match(/content=["']?(\d+)/i);
        if (statusCodeMatch) {
          return parseInt(statusCodeMatch[1]);
        }
      }
      return null;
    }
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

  _createImpressQueue: function() {
    this.impressQueue = new ImpressQueue(this.options);
  }

};
