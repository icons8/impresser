const
  DEFAULT_IMPRESS_TIMEOUT = 20000,
  DEFAULT_IMPRESS_MAX_CONTENT_LENGTH = 2097152,
  MIN_INVOKE_INTERVAL = 500,
  OK_EXIT_CODE = 0,
  ERROR_EXIT_CODE = 1,
  PAGE_NOT_FOUND_EXIT_CODE = 2
  ;

var
  path = require('path'),
  exec = require('child_process').exec,
  PageNotFoundError = require('../error/PageNotFoundError')
  ;

module.exports = ImpressInstance;

function ImpressInstance(deferred, options) {
  options = options || {};

  this.args = {
    "--ignore-ssl-errors": 'true',
    "--ssl-protocol": 'tlsv1'
  };

  this.binary = options.impressBinary || path.join(__dirname, '../../phantomjs/binary/phantomjs');
  this.impress = options.impressPath || path.join(__dirname, '../../phantomjs/impress.js');
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

  _getCommandExecString: function(base64EncodedUrl) {
    var
      args = this.args,
      builder;

    if (typeof base64EncodedUrl == 'undefined') {
      base64EncodedUrl = true;
    }

    builder = [
      this.binary
    ];

    Array.prototype.push.apply(builder,
      Object.keys(this.args).map(function(key) {
        return key + '=' + args[key];
      })
    );

    builder.push(this.impress);

    if (base64EncodedUrl) {
      builder.push(
        '"' + base64encode(this.deferred.url) + '"',
        '--url-base64-encoded'
      );
    }
    else {
      builder.push(this.deferred.url);
    }

    return builder.join(' ');

    function base64encode(string) {
      return new Buffer(string || '').toString('base64');
    }
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

    function stopTimeout() {
      clearTimeout(timeoutId);
    }

    function finish(err, content, warn) {
      stopTimeout();
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
        if (err instanceof PageNotFoundError) {
          console.error('ERROR page "' + url + '" not found');
          finish(err, content, warn);
        }
        else if (err || (err = self._validateContentAndGetValidationError(content))) {
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
        child = exec(self._getCommandExecString(), {
          timeout: self.invokeTimeout,
          maxBuffer: self.maxContentLength
        });
        child.on('error', errorHandler);
        child.on('close', function (code) {
          switch(code) {
            case OK_EXIT_CODE:
              finish(null, getResultData(), getErrorData());
              break;

            case PAGE_NOT_FOUND_EXIT_CODE:
              finish(new PageNotFoundError(), getResultData());
              break;

            default:
              finish(getErrorData() || getResultData(), getResultData());
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
