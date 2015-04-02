const
  DEFAULT_IMPRESS_TIMEOUT = 10000,
  DEFAULT_IMPRESS_MAX_CONTENT_LENGTH = 1024 * 1024,
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
  this.timeout = options.impressTimeout || DEFAULT_IMPRESS_TIMEOUT;
  this.maxLength = options.impressMaxContentLength || DEFAULT_IMPRESS_MAX_CONTENT_LENGTH;

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
      self = this;

    if (!args) {
      return
    }

    if (typeof args == 'object') {
      if (Array.isArray(args)) {
        args.forEach(function(arg) {
          var
            parts = arg.split('=');
          self.args[parts[0]] = parts[1];
        })
      }
      else {
        Object.keys(args).forEach(function(key) {
          self.args[key] = args[key];
        });
      }
    }
    else if (typeof args == 'string') {
      args = args.replace(/\s*=\s*/g, '=');
      Array.prototype.push.apply(
        this.args,
        args.split(/\s+/).filte(function(arg) {
          return arg;
        })
      )
    }
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
      child,
      stdout,
      stderr,
      deferred = this.deferred,
      errorDataBuilder = [],
      resultDataBuilder = [],
      commandString;

    function finish(error, result, warn) {
      try {
        child && child.kill();
      }
      catch(e) {}
      deferred.finish(error, result, warn)
    }

    function errorHandler(error) {
      finish(getErrorData(error), null);
    }

    function getErrorData(error) {
      return errorDataBuilder.length > 0
        ? errorDataBuilder.join('')
        : error;
    }

    function getResultData(result) {
      return resultDataBuilder.length > 0
        ? resultDataBuilder.join('')
        : result;
    }

    commandString = this._getCommandExecString();

    try {
      child = exec(commandString, {
        timeout: this.timeout,
        maxBuffer: this.maxLength
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
  }

};
