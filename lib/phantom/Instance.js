const
  DEFAULT_EXEC_TIMEOUT = 5000,
  DEFAULT_PHANTOM_IMPRESS_TIMEOUT = 19000,
  INVOKE_READY_WAIT_TIME = 300
  ;

var
  path = require('path'),
  spawn = require('child_process').spawn,
  EventEmitter = require('events').EventEmitter
  ;

module.exports = Instance;

function Instance(portPool, options) {
  options = options || {};

  this.portPool = portPool;

  this.binary = options.phantomBinary || 'phantomjs';
  this.scriptPath = options.phantomScript || path.join(__dirname, '../../phantomjs/impress.js');
  this.notices = options.impressNotices;
  this.warnings = options.impressWarnings;

  this.timeout = options.phantomImpressTimeout || DEFAULT_PHANTOM_IMPRESS_TIMEOUT;
  this.execTimeout = options.phantomExecTimeout || DEFAULT_EXEC_TIMEOUT;
  this.blockedResources = options.blockedResources;

  if (options.phantomArgs) {
    this._addArgs(options.phantomArgs);
  }

  this.args = {
    "--ignore-ssl-errors": 'true',
    "--ssl-protocol": 'tlsv1'
  };

  this.serverPort = null;
  this.destroyed = false;

  this.startTime = null;

  this._em = new EventEmitter();

  this._process = null;
  this._execTimeoutId = null;
  this._execStatusTimeoutId = null;

  this._killed = false;
  this._started = false;

  this._init();
}

Instance.prototype = {

  _init: function() {
    this._initReadyPromise();
    this._initClosePromise();
  },

  _initReadyPromise: function() {
    var
      self = this,
      noop = function() {};

    this.readyPromise = function(fn) {
      if (self._killed) {
        console.error('Error: Add ready listener for killed phantom instance');
        return noop;
      }
      if (this._started) {
        try {
          fn && fn();
        }
        catch(e) {
          console.error(e);
        }
      }
      self._em.on('ready', fn);

      return function() {
        self._em.removeListener('ready', fn);
      }
    }
  },

  _initClosePromise: function() {
    var
      self = this;

    this.closePromise = function(fn) {
      if (self._killed) {
        try {
          fn && fn();
        }
        catch(e) {
          console.error(e);
        }
      }
      self._em.once('close', fn);

      return function() {
        self._em.removeListener('close', fn);
      }
    }
  },

  isReady: function() {
    return this._started && !this._killed;
  },

  isStarting: function() {
    return !this._started && !this._killed;
  },

  run: function() {
    if (!this._process) {
      this.startTime = Date.now();
      this._exec();
    }
  },

  destroy: function() {
    this._kill();
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

  _createInstancePort: function() {
    if (this.serverPort) {
      this._releaseInstancePort();
    }
    this.serverPort = this.portPool.getPort();
    return this.serverPort;
  },

  _releaseInstancePort: function() {
    if (this.serverPort) {
      this.portPool.delayedReleasePort(this.serverPort);
      this.serverPort = null;
    }
  },

  _getExecArgs: function() {
    var
      args = this.args,
      builder;

    builder = [];

    Array.prototype.push.apply(builder,
      Object.keys(this.args).map(function(key) {
        return key + '=' + args[key];
      })
    );

    builder.push(
      this.scriptPath,
      '--server-port=' + this._createInstancePort(),
      '--timeout=' + this.timeout
    );

    if (this.notices) {
      builder.push('--notices');
    }
    if (this.warnings) {
      builder.push('--warnings');
    }
    if (Array.isArray(this.blockedResources) && this.blockedResources.length > 0) {
      Array.prototype.push.apply(
        builder,
        this.blockedResources.map(function(resource) {
          return '--blocked-resources=' + base64encode(resource);
        })
      );
      builder.push('--blocked-resources-base64-encoded');
    }

    return builder;

    function base64encode(string) {
      return new Buffer(string || '').toString('base64');
    }
  },

  _exec: function() {
    var
      self = this,
      phantomjs,
      stdout,
      stderr,
      time = Date.now();

    if (this._process) {
      console.warn('Warn: Phantom process already executed');
      return;
    }

    function errorHandler(error) {
      self._cancelExecTimeout();
      if (self._killed) {
        return;
      }
      if (error instanceof Buffer) {
        error = error.toString();
      }
      console.error('Error: Phantom process error', error || '');
      self._kill();
    }

    function closeHandler(code) {
      if (code) {
        errorHandler('Exit with code: ' + code);
        return;
      }
      self._cancelExecTimeout();
      console.error('Info: Phantom process closed');
      if (self._killed) {
        return;
      }
      self._kill();
    }

    function ready() {
      self._cancelExecTimeout();
      if (self._killed || self._started) {
        return;
      }
      self._started = true;
      console.log('Ok: phantom process started in time', Date.now() - time, 'ms');
      self._em.emit('ready');
    }

    this._execTimeoutId = setTimeout(
      function() {
        errorHandler('Exec timeout', self.execTimeout);
      },
      this.execTimeout
    );

    try {
      phantomjs = spawn(this.binary, this._getExecArgs());
      phantomjs.on('error', errorHandler);
      phantomjs.on('close', closeHandler);

      stdout = phantomjs.stdout;
      stdout.on('error', errorHandler);
      stdout.on('data', function(data) {
        if (data instanceof Buffer) {
          data = data.toString();
        }
        console.log('Info: Phantom process output:', data);

        if (!self._execStatusTimeoutId && !self._started) {
          self._execStatusTimeoutId = setTimeout(
            function() {
              ready();
            },
            INVOKE_READY_WAIT_TIME
          );
        }

      });

      stderr = phantomjs.stderr;
      stderr.on('error', errorHandler);
      stderr.on('data', errorHandler);

      this._process = phantomjs;
    }
    catch(e) {
      errorHandler(e);
    }

  },

  _cancelExecStatusTimeout: function() {
    this._execStatusTimeoutId && clearTimeout(this._execStatusTimeoutId);
    this._execStatusTimeoutId = null;
  },

  _cancelExecTimeout: function() {
    this._execTimeoutId && clearTimeout(this._execTimeoutId);
    this._execTimeoutId = null;
    this._cancelExecStatusTimeout();
  },

  _kill: function() {
    var
      killed = this._killed;

    this._cancelExecTimeout();
    try {
      this._process && this._process.kill();
      this._releaseInstancePort();
    }
    catch(e) {
      console.error('Error: Phantom kill process error', e);
    }
    this._process = null;
    this._killed = true;

    if (!killed) {
      this._em.emit('close');
      this._em.removeAllListeners();
    }
  }


};
