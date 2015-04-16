const
  DEFAULT_EXEC_TIMEOUT = 6000,
  DEFAULT_IMPRESS_ATTEMPT_TIMEOUT = 12000,
  DEFAULT_IMPRESS_TIMEOUT = 30000,
  INVOKE_DELAY = 500,
  RE_INVOKE_DELAY = 500,
  TIMEOUT_APPENDIX = 200
  ;

var
  path = require('path'),
  exec = require('child_process').exec,
  http = require('http'),
  qs = require('querystring'),
  HtmlFilter = require('../html/Filter')
  ;

module.exports = Instance;

function Instance(portPool, options, htmlFilters) {
  options = options || {};

  this.portPool = portPool;

  this.args = {
    "--ignore-ssl-errors": 'true',
    "--ssl-protocol": 'tlsv1'
  };

  this.binary = options.phantomBinary || 'phantomjs';
  this.scriptPath = options.phantomScript || path.join(__dirname, '../../phantomjs/impress.js');
  this.notices = options.impressNotices;
  this.warnings = options.impressWarnings;
  this.attemptTimeout = options.impressAttemptTimeout || DEFAULT_IMPRESS_ATTEMPT_TIMEOUT;
  this.timeout = options.impressTimeout || DEFAULT_IMPRESS_TIMEOUT;
  this.execTimeout = options.phantomExecTimeout || DEFAULT_EXEC_TIMEOUT;

  if (options.phantomArgs) {
    this._addArgs(options.phantomArgs);
  }

  this.blockedResources = [];
  this._addBlockedResources(options.blockedResources);

  this.htmlFilter = new HtmlFilter(htmlFilters, options);

  this.deferred = null;
  this.serverPort = null;
  this.ready = false;
  this.pending = false;
  this.destroyed = false;

  this._process = null;
  this._reInvokeDelayId = null;
  this._applyPending = false;
  this._impressTimeoutId = null;
  this._execTimeoutId = null;
  this._invokeDelayId = null;

}

Instance.prototype = {

  destroy: function() {
    this.deferred = undefined;
    this._cancelExecTimeout();
    this._stopInvokeDelay();
    this._kill();
    this._stopReInvokeDelay();
    this._releaseServerPort();
    this._cancelImpressTimeout();
    this._abortImpressAttempt();
    this.destroyed = true;
  },

  _addArgs: function(args) {
    var
      collection = {},
      self = this
      ;

    if (!args) {
      return
    }

    if (typeof args == 'object') {
      if (Array.isArray(args)) {
        args.forEach(function(arg) {
          var
            parts = arg.split('=');
          collection[parts[0]] = String(parts[1] || '');
        })
      }
      else {
        Object.keys(args).forEach(function(key) {
          collection[key] = String(args[key]);
        });
      }
    }
    else if (typeof args == 'string') {
      args = args.replace(/\s*=\s*/g, '=');
      args.split(/\s+/).forEach(function(arg) {
        var
          parts;
        if (arg) {
          parts = String(arg).split('=');
          collection[parts[0]] = String(parts[1] || '');
        }
      });
    }

    Object.keys(collection).forEach(function(key) {
      var
        arg = collection[key];

      if (!/^--[^-]/.test(key)) {
        if (key[0] == '-') {
          key = key.slice(1);
        }
        key = '--' + key;
      }
      self.args[key] = arg;
    });

    return this.args;
  },


  _addBlockedResources: function(resources) {
    var
      self = this;

    if (typeof resources == 'string') {
      this.blockedResources.push(resources);
    }
    else if (Array.isArray(resources)) {
      resources.forEach(function(resource) {
        self._addBlockedResources(resource);
      });
    }
    else if (resources && typeof resources == 'object' && typeof resources.getResources == 'function') {
      this._addBlockedResources(resources.getResources());
    }
  },

  _createServerPort: function() {
    if (this.serverPort) {
      this._releaseServerPort();
    }
    this.serverPort = this.portPool.getPort();
    return this.serverPort;
  },

  _releaseServerPort: function() {
    if (this.serverPort) {
      this.portPool.delayedReleasePort(this.serverPort);
      this.serverPort = null;
    }
  },

  _getCommandExecString: function() {
    var
      args = this.args,
      builder;

    builder = [
      this.binary
    ];

    Array.prototype.push.apply(builder,
      Object.keys(this.args).map(function(key) {
        return key + '=' + args[key];
      })
    );

    builder.push(
      this.scriptPath,
      '--server-port=' + this._createServerPort()
    );

    if (this.notices) {
      builder.push('--notices');
    }
    if (this.warnings) {
      builder.push('--warnings');
    }
    if (this.blockedResources.length > 0) {
      Array.prototype.push.apply(
        builder,
        this.blockedResources.map(function(resource) {
          return '--blocked-resources "' + base64encode(resource) + '"';
        })
      );
      builder.push('--blocked-resources-base64-encoded');
    }

    return builder.join(' ');

    function base64encode(string) {
      return new Buffer(string || '').toString('base64');
    }
  },

  _apply: function() {
    var
      self = this,
      deferred,
      url,
      canceled = false,
      finished = false,
      requestOptions,
      requestTime = Date.now(),
      responseTime = null,
      unlink,
      req
      ;

    this.ready = true;
    if (!this.deferred || this._applyPending) {
      return;
    }
    this._applyPending = true;

    deferred = this.deferred;
    url = deferred.url;

    unlink = deferred.promise(function() {
      canceled = true;
      self._applyPending = false;
      self._abortImpressAttempt();
      unlink && unlink();
    });

    this._impressAttemptTimeoutId = setTimeout(
      function() {
        console.error('Impress attempt timeout', self.attemptTimeout);
        retry();
      },
      this.attemptTimeout
    );

    function retry() {
      self._applyPending = false;
      self._abortImpressAttempt();
      self._invoke();
      canceled = true;
      unlink && unlink();
    }

    function done(result) {
      self._cancelImpressTimeout();
      self._abortImpressAttempt();
      self._performImpressReport(result);
      finished = true;
      result.content = self.htmlFilter.apply(result.content);
      deferred.finish(null, result);
    }

    requestOptions = {
      port: this.serverPort,
      path: '/?' + qs.stringify({ url: url })
    };

    try {
      req = http.request(requestOptions, function(res) {
        var
          result = '';
        if (canceled) {
          return;
        }

        if (res.statusCode != 200) {
          console.error('Error request to impress server with http status code', res.statusCode);
          retry();
          return;
        }
        res.on('error', function(error) {
          if (canceled || finished) {
            return;
          }
          console.error('Impress request error', error);
          retry();
        });

        res.on('data', function(chunk) {
          if (canceled || finished) {
            return;
          }
          if (!responseTime) {
            responseTime = Date.now() - requestTime;
          }
          result = result
            ? result + chunk
            : chunk;
        });

        res.on('end', function() {
          var
            error = null;

          if (canceled || finished) {
            return;
          }
          try {
            result = JSON.parse(result);
          }
          catch(e) {
            error = 'Could not parse impress result. Expected error: ' + e;
          }
          if (!error && !result.ok) {
            console.error('ERROR impress page "' + url + '":', (result.errors || []).join());
            retry();
            return;
          }
          if (!error) {
            error = self._validateContentAndGetValidationError(result.content);
          }

          if (error) {
            console.error('ERROR page "' + url + '" could not be impressed. Try next attempt.', error);
            retry();
          }
          else {
            console.log('OK page "' + url + '" in time', responseTime, 'ms');
            done(result);
          }
        });

      });
      req.on('error', function(error) {
        if (canceled || finished) {
          return;
        }
        console.error('Impress request error', error);
        retry();
      });
      req.end();

      this._impressRequest = req;
    }
    catch(error) {
      console.error('Impress request error', error);
      retry();
    }

  },

  _abortImpressAttempt: function() {
    try {
      this._impressRequest && this._impressRequest.abort();
    }
    catch(e) {
      console.error('Could not abort impress request', e);
    }
    this._impressRequest = null;
    this._impressAttemptTimeoutId && clearTimeout(this._impressAttemptTimeoutId);
    this._impressAttemptTimeoutId = null;
  },

  _cancelImpressTimeout: function() {
    this._impressTimeoutId && clearTimeout(this._impressTimeoutId);
    this._impressTimeoutId = null;
  },

  init: function() {
    if (!this._process) {
      this._invoke();
    }
  },

  run: function(deferred) {
    var
      self = this,
      unlink,
      timeout;

    this.init();
    if (this.pending) {
      deferred.reject('ERROR: impress process already pending. Page', deferred.url, 'rejected');
      return;
    }

    deferred.startExecution();

    timeout = Math.min(deferred.getRemainedTimeout() - TIMEOUT_APPENDIX, this.timeout);
    timeout = Math.max(timeout, 0);

    this._impressTimeoutId = setTimeout(
      function() {
        deferred.reject('FAIL page "' + deferred.url + '" impress timeout ' + timeout);
      },
      timeout
    );

    this.pending = true;
    this.deferred = deferred;
    if (this.ready) {
      this._apply();
    }
    unlink = deferred.promise(function() {
      self._cancelImpressTimeout();
      self.pending = false;
      self.deferred = null;
      unlink && unlink();
    });
  },

  _validateContentAndGetValidationError: function(content) {
    if (!/^\s*(<html|<!doctype)/i.test(content)) {
      return 'Could not found html tag or doctype info';
    }
    if (!/\/html\s*>\s*$/i.test(content)) {
      return 'Could not found close html tag';
    }
    return null;
  },

  _performImpressReport: function(result) {
    var
      url = this.deferred.url;

    if (this.warnings && result.warnings && result.warnings.length > 0) {
      console.warn('IMPRESS WARNINGS for page "' + (result.url || url) + '":\n', result.warnings.join('\n'));
    }
    if (this.notices && result.notices && result.notices.length > 0) {
      console.info('IMPRESS NOTICES for page "' + (result.url || url) + '":\n', result.notices.join('\n'));
    }
  },

  _invoke: function() {
    var
      self = this,
      child,
      stdout,
      stderr,
      time = Date.now(),
      killed = false,
      started = false;

    if (this._process) {
      this._kill();
      return;
    }

    function errorHandler(error) {
      self._cancelExecTimeout();
      self._stopInvokeDelay();
      if (killed) {
        return;
      }
      killed = true;
      console.error('IMPRESS PROCESS ERROR', error || '');
      self._kill();
    }

    function ready() {
      self._cancelExecTimeout();
      self._stopInvokeDelay();
      if (killed || !self._process || started) {
        return;
      }
      started = true;
      console.log('OK impress process started in time', Date.now() - time, 'ms');
      self._apply();
    }

    process.nextTick(function() {

      self._execTimeoutId = setTimeout(
        function() {
          errorHandler('Exec timeout', self.execTimeout);
        },
        self.execTimeout
      );

      try {
        child = exec(self._getCommandExecString());
        child.on('error', errorHandler);
        child.on('close', function() {
          errorHandler();
        });

        stdout = child.stdout;
        stdout.on('error', errorHandler);
        stdout.on('data', function(data) {
          console.log('Impress process output:', data);

          if (!self._invokeDelayId && !started) {
            self._invokeDelayId = setTimeout(
              function() {
                ready();
              },
              INVOKE_DELAY
            );
          }

        });

        stderr = child.stderr;
        stderr.on('error', errorHandler);
        stderr.on('data', errorHandler);

        self._process = child;
      }
      catch(e) {
        errorHandler(e);
      }
    });
  },

  _stopInvokeDelay: function() {
    this._invokeDelayId && clearTimeout(this._invokeDelayId);
    this._invokeDelayId = null;
  },

  _cancelExecTimeout: function() {
    this._execTimeoutId && clearTimeout(this._execTimeoutId);
    this._execTimeoutId = null;
  },

  _kill: function() {
    var
      child,
      self = this;

    this._cancelExecTimeout();
    child = this._process;
    this._process = null;

    process.nextTick(function() {
      try {
        child && child.kill();
      }
      catch(e) {
        console.error('IMPRESS KILL PROCESS ERROR', e);
      }
    });

    if (this._reInvokeDelayId) {
      return;
    }
    this._reInvokeDelayId = setTimeout(
      function() {
        self._reInvokeDelayId = null;
        self._invoke();
      },
      RE_INVOKE_DELAY
    );
  },

  _stopReInvokeDelay: function() {
    this._reInvokeDelayId && clearTimeout(this._reInvokeDelayId);
    this._reInvokeDelayId = null;
  }



};
