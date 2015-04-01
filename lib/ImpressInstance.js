var
  path = require('path'),
  exec = require('child_process').exec;

module.exports = ImpressInstance;

function ImpressInstance(deferred, options) {
  options = options || {};

  this.args = {
    "--load-images": false,
    "--ignore-ssl-errors": true,
    "--ssl-protocol": 'tlsv1'
  };

  this.binary = options.binary || path.join(__dirname, '../phantomjs/binary/phantomjs');
  this.impress = options.impress || path.join(__dirname, '../phantomjs/impress.js');
  this.timeout = options.timeout || 10000;
  this.maxLength = options.maxLength || 1024 * 1024;

  if (options.args) {
    this.addArgs(options.args);
  }

  this.deferred = deferred;
}

ImpressInstance.prototype = {

  addArgs: function(args) {
    var
      self = this;

    if (args && typeof args == 'object') {
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
      reject,
      finish,
      commandString;

    finish = function(error, result) {
      try {
        child && child.kill();
      }
      catch(e) {}

      deferred.finish(
        errorDataBuilder.length > 0
          ? errorDataBuilder.join('')
          : error,
        resultDataBuilder.length > 0
          ? resultDataBuilder.join('')
          : result
      )
    };

    reject = function(error) {
      finish(error, null);
    };

    commandString = this._getCommandExecString();

    try {
      child = exec(commandString, {
        timeout: this.timeout,
        maxBuffer: this.maxLength
      });
      child.on('error', reject);
      child.on('close', function (code) {
        finish();
      });

      stdout = child.stdout;
      stdout.on('error', reject);
      stdout.on('data', function(data) {
        resultDataBuilder.push(data);
      });

      stderr = child.stderr;
      stderr.on('error', reject);
      stderr.on('data', function(data) {
        errorDataBuilder.push(data);
      });

    }
    catch(e) {
      reject(e);
    }
  }

};
