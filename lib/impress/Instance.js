const
  DEFAULT_EXEC_TIMEOUT = 5000,
  DEFAULT_IMPRESS_TIMEOUT = 12000,
  RE_INVOKE_DELAY = 500,
  TIMEOUT_APPENDIX = 200
  ;

var
  path = require('path'),
  exec = require('child_process').exec,
  request = require('request'),
  HtmlCompressor = require('../html/Compressor')
  ;

module.exports = Instance;

function Instance(portPool, options) {
  options = options || {};

  this.portPool = portPool;

  this.args = {
    "--ignore-ssl-errors": 'true',
    "--ssl-protocol": 'tlsv1'
  };

  this.binary = options.phantomBinary || path.join(__dirname, '../../phantomjs/binary/phantomjs');
  this.scriptPath = options.phantomScript || path.join(__dirname, '../../phantomjs/impress.js');
  this.notices = options.impressNotices;
  this.warnings = options.impressWarnings;
  this.timeout = options.impressTimeout || DEFAULT_IMPRESS_TIMEOUT;
  this.execTimeout = options.phantomExecTimeout || DEFAULT_EXEC_TIMEOUT;

  if (options.phantomArgs) {
    this.addArgs(options.phantomArgs);
  }

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
}

Instance.prototype = {

  destroy: function() {
    this.deferred = undefined;
    this._cancelExecTimeout();
    this._kill();
    this._stopReInvokeDelay();
    this._releaseServerPort();
    this._cancelImpressTimeout();
    this.destroyed = true;
  },

  addArgs: function(args) {
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

    return builder.join(' ');
  },

  _init: function() {
    if (!this._process) {
      this._invoke();
    }
  },

  _apply: function() {
    var
      self = this,
      deferred = this.deferred,
      url = deferred.url,
      canceled = false,
      requestOptions,
      startTime = Date.now(),
      unlink
      ;

    this.ready = true;
    if (!this.deferred || this._applyPending) {
      return;
    }
    this._applyPending = true;

    unlink = deferred.promise(function() {
      canceled = true;
      self._applyPending = false;
      self._cancelImpressTimeout();
      unlink && unlink();
    });

    this._impressTimeoutId = setTimeout(
      retry,
      this.timeout + TIMEOUT_APPENDIX
    );

    function retry() {
      self._applyPending = false;
      self._cancelImpressTimeout();
      self._invoke();
      canceled = true;
      unlink && unlink();
    }

    function done(result) {
      self._cancelImpressTimeout();
      self._performImpressReport(result);
      result.content = new HtmlCompressor(result.content).getContent();
      deferred.finish(null, result);
    }

    requestOptions = {
      url: 'http://127.0.0.1:' + this.serverPort,
      qs: {
        url: url
      },
      timeout: this.timeout
    };

    request(requestOptions, function(err, response, result) {
      if (canceled) {
        return;
      }
      if (!err) {
        try {
          result = JSON.parse(result);
        }
        catch(e) {
          err = e;
        }
      }

      if (err || (err = self._validateContentAndGetValidationError(result.content))) {
        console.error('ERROR page "' + url + '" could not be impressed. Try next attempt.', err);
        retry();
      }
      else {
        console.log('OK page "' + url + '" in time', Date.now() - startTime, 'ms');
        done(result);
      }
    });

  },

  _cancelImpressTimeout: function() {
    this._impressTimeoutId && clearTimeout(this._impressTimeoutId);
    this._impressTimeoutId = null;
  },

  run: function(deferred) {
    var
      self = this,
      unlink;

    this._init();
    if (this.pending) {
      console.error('ERROR: impress precess already pending. Page', deferred.url, 'rejected');
      deferred.reject();
      return;
    }

    this.pending = true;
    this.deferred = deferred;
    if (this.ready) {
      this._apply();
    }
    unlink = deferred.promise(function() {
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
      output = '',
      time = Date.now(),
      killed = false,
      started = false;

    if (this._process) {
      this._kill();
      return;
    }

    function errorHandler(error) {
      if (killed || !self._process) {
        return;
      }
      killed = true;
      console.error('IMPRESS PROCESS ERROR', error || output || 'Unknown Error');
      self._kill();
    }

    function ready() {
      self._cancelExecTimeout();
      if (killed || !self._process || started) {
        return;
      }
      started = true;
      console.log('OK impress precess started in time', Date.now() - time, 'ms','Output:', output);
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
          output += data;
          ready();
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

  _cancelExecTimeout: function() {
    this._execTimeoutId && clearTimeout(this._execTimeoutId);
    this._execTimeoutId = null;
  },

  _kill: function() {
    var
      self = this;

    try {
      this._cancelExecTimeout();
      this._process && this._process.kill();
      this._process = null;
    }
    catch(e) {
      console.error('IMPRESS KILL PROCESS ERROR', e);
    }

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
