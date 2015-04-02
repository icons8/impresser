const
  DEFAULT_IMPRESS_TIMEOUT = 20000,
  DEFAULT_IMPRESS_MAX_CONTENT_LENGTH = 2097152,
  MIN_INVOKE_INTERVAL = 500,
  OK_EXIT_CODE = 0
  ;

var
  path = require('path'),
  exec = require('child_process').exec
  ;

module.exports = ImpressInstance;

function ImpressInstance(deferred, options) {
  options = options || {};

  this.args = {
    "--load-images": 'false',
    "--ignore-ssl-errors": 'true',
    "--ssl-protocol": 'tlsv1'
  };

  this.binary = options.impressBinary || path.join(__dirname, '../phantomjs/binary/phantomjs');
  this.impress = options.impressPath || path.join(__dirname, '../phantomjs/impress.js');
  this.invokeTimeout = options.impressTimeout || DEFAULT_IMPRESS_TIMEOUT;
  this.maxContentLength = options.impressMaxContentLength || DEFAULT_IMPRESS_MAX_CONTENT_LENGTH;

  this.timeout = deferred.timeout - (Date.now() - deferred.createdTime);
  this.invokeTimeout = Math.min(this.invokeTimeout, this.timeout);

  if (options.impressArgs) {
    this.addArgs(options.impressArgs);
  }

  this.deferred = deferred;
}

ImpressInstance.prototype = {

  destroy: function() {
    this.deferred = undefined;
  },

  addArgs: function(args) {
    var
      self = this,
      list = [];

    if (!args) {
      return
    }

    if (typeof args == 'object') {
      if (Array.isArray(args)) {
        args.forEach(function(arg) {
          var
            parts = arg.split('=');
          list[parts[0]] = parts[1];
        })
      }
      else {
        Object.keys(args).forEach(function(key) {
          list[key] = args[key];
        });
      }
    }
    else if (typeof args == 'string') {
      args = args.replace(/\s*=\s*/g, '=');
      list = args.split(/\s+/);
    }
    list = list
      .filter(function(arg) {
        return arg;
      })
      .map(function(arg) {
        if (!/^--[^-]/.test(arg)) {
          if (arg[0] == '-') {
            arg = arg.slice(1);
          }
          arg = '--' + arg;
        }
        return arg;
      });

    Array.prototype.push.apply(this.args, list);
    return this.args;
  },

  _getCommandExecString: function() {
    var
      args = this.args;

    return [ this.binary ]
      .concat(
        this.impress,
        this.deferred.url,
        Object.keys(this.args).map(function(key) {
          return key + '=' + args[key];
        })
      )
      .join(' ');
  },

  run: function() {
    var
      self = this,
      deferred = this.deferred,
      url = deferred.url,
      resultPromise,
      timeoutId;

    timeoutId = setTimeout(
      function() {
        resultPromise && resultPromise.cancel();
        deferred.reject('FAIL page "' + url + '" impress timeout ' + self.timeout);
        resultPromise.cancel();
      },
      this.timeout
    );

    invoke();

    function finish(err, content, warn) {
      clearTimeout(timeoutId);
      deferred.finish(err, content, warn);
    }

    function invoke() {
      var
        startTime = Date.now();
      resultPromise = self._invoke();
      resultPromise(function(err, content, warn) {
        var
          invokeTime = Date.now() - startTime,
          _invoke;

        _invoke = function() {
          if (!resultPromise.canceled) {
            invoke();
          }
        };

        if (err || (err = self._validateContentAndGetValidationError(content))) {
          console.error('ERROR page "' + url + '" could not be impressed. Try next attempt.', err);
          if (invokeTime < MIN_INVOKE_INTERVAL) {
            setTimeout(_invoke, MIN_INVOKE_INTERVAL - invokeTime);
          }
          else {
            process.nextTick(_invoke);
          }
        }
        else {
          console.log('OK page "' + url + '" in time', Date.now() - startTime, 'ms');
          finish(err, content, warn);
        }
      });
    }
  },

  _validateContentAndGetValidationError: function(content) {
    content = String(content || '');
    if (!/^\s*(<html|<!doctype)/i.test(content)) {
      return 'Could not found html tag or doctype info';
    }
    if (!/\/html\s*>\s*$/i.test(content)) {
      return 'Could not found close html tag';
    }
    return null;
  },

  _invoke: function() {
    var
      self = this,
      child,
      stdout,
      stderr,
      errorDataBuilder = [],
      resultDataBuilder = [],
      commandString,
      resultListeners = [],
      resultPerformed = false,
      resultPromise;

    resultPromise = function(fn) {
      if (fn && typeof fn == 'function') {
        resultListeners.push(fn);
      }
    };
    resultPromise.canceled = false;
    resultPromise.cancel = function() {
      resultPromise.canceled = true;
      kill();
    };

    function kill() {
      try {
        child && child.kill();
      }
      catch(e) {
        console.error(e);
      }
    }

    function finish(error, result, warn) {
      kill();
      if (resultPerformed || resultPromise.canceled) {
        return;
      }
      resultPerformed = true;
      resultListeners.forEach(function(fn) {
        try {
          fn && fn(error, result, warn);
        }
        catch(e) {
          console.error(e);
        }
      });
    }

    function errorHandler(error) {
      finish(getErrorData(error), null);
    }

    function getErrorData(error) {
      return errorDataBuilder.length > 0
        ? errorDataBuilder.join('')
        : error || '';
    }

    function getResultData(result) {
      return resultDataBuilder.length > 0
        ? resultDataBuilder.join('')
        : result || '';
    }

    process.nextTick(function() {
      try {
        commandString = self._getCommandExecString();

        child = exec(commandString, {
          timeout: self.invokeTimeout,
          maxBuffer: self.maxContentLength
        });
        child.on('error', errorHandler);
        child.on('close', function (code) {
          if (code === OK_EXIT_CODE) {
            finish(null, getResultData(), getErrorData());
          }
          else {
            finish(getErrorData(), getResultData());
          }
        });

        stdout = child.stdout;
        stdout.on('error', errorHandler);
        stdout.on('data', function(data) {
          resultDataBuilder.push(data);
        });

        stderr = child.stderr;
        stderr.on('error', errorHandler);
        stderr.on('data', function(data) {
          errorDataBuilder.push(data);
        });

      }
      catch(e) {
        errorHandler(e);
      }
    });

    return resultPromise;
  }



};
