const
  DEFAULT_PHANTOM_TTL = 1800000,
  DEFAULT_IMPRESS_ATTEMPT_TIMEOUT = 20000,
  DEFAULT_IMPRESS_TIMEOUT = 47000,
  PHANTOM_TTL_SPREAD_FACTOR = .2,
  TIMEOUT_APPENDIX = 100,
  MIN_PHANTOM_RESTART_INTERVAL = 500
  ;

var
  http = require('http'),
  qs = require('querystring'),
  HtmlFilter = require('../html/Filter'),
  PhantomInstance = require('../phantom/Instance')
  ;

module.exports = Instance;

function Instance(portPool, htmlFilters, options) {
  options = options || {};

  this.options = options;

  this.attemptTimeout = options.impressAttemptTimeout || DEFAULT_IMPRESS_ATTEMPT_TIMEOUT;
  this.timeout = options.impressTimeout || DEFAULT_IMPRESS_TIMEOUT;
  this.ttl = options.phantomTtl || DEFAULT_PHANTOM_TTL;
  this.minPhantomRestartInterval = options.minPhantomRestartInterval || MIN_PHANTOM_RESTART_INTERVAL;
  this.notices = options.loggingImpressNotices;
  this.warnings = options.loggingImpressWarnings;

  this.htmlFilter = new HtmlFilter(htmlFilters, options);
  this.portPool = portPool;

  this.deferred = null;
  this.pending = false;
  this.destroyed = false;

  this._phantom = null;
  this._applyPending = false;
  this._impressTimeoutId = null;
  this._impressAttemptTimeoutId = null;
  this._phantomRestartDelayId = null;
}

Instance.prototype = {

  destroy: function() {
    if (this.deferred) {
      this.deferred.reject('Instance destroyed');
    }
    this.deferred = null;
    this._phantom && this._phantom.destroy();
    this._phantom = null;

    this._cancelPhantomRestartDelay();
    this._cancelTtlTimeout();
    this._cancelImpressTimeout();
    this._abortImpressAttempt();

    this.destroyed = true;
  },

  prepare: function() {
    this._phantomStart();
  },

  run: function(deferred) {
    var
      self = this,
      timeout;

    if (this.pending) {
      deferred.reject('Fail: Impress process already pending. Page', deferred.url, 'rejected');
      return;
    }
    if (this.destroyed) {
      deferred.reject('Fail: Impress instance already destroyed. Page', deferred.url, 'rejected');
      return;
    }

    deferred.startExecution();

    timeout = Math.min(deferred.getRemainedTimeout() - TIMEOUT_APPENDIX, this.timeout);
    timeout = Math.max(timeout, 0);

    this._impressTimeoutId = setTimeout(
      function() {
        deferred.reject('Fail: Page "' + deferred.url + '" impress timeout ' + timeout);
      },
      timeout
    );

    this.pending = true;
    this.deferred = deferred;

    this._phantomStart();
    this._apply();

    deferred.promise(function(err) {
      self._cancelImpressTimeout();
      if (err) {
        self._phantomRestart();
      }
      self.pending = false;
      self.deferred = null;
    });
  },

  _phantomStart: function() {
    if (!this._phantom) {
      this._phantomRestart();
    }
  },

  _phantomRestart: function() {
    var
      delay = null,
      self = this,
      phantom;

    if (this._phantom) {
      if (this._phantom.isStarting()) {
        return;
      }

      delay = this._phantom.startTime && this.minPhantomRestartInterval - (Date.now() - this._phantom.startTime);
      phantom = this._phantom;
      this._phantom = null;
      phantom.destroy();
      return;
    }

    if (this._phantomRestartDelayId) {
      return;
    }

    if (delay && delay > 0) {
      this._phantomRestartDelayId = setTimeout(run, delay);
    }
    else {
      run();
    }

    function run() {
      self._phantom = new PhantomInstance(self.portPool, self.options);
      self._phantom.run();
      self._phantom.readyPromise(function() {
        self._resetTtlTimeout();
        self._apply();
      });
      self._phantom.closePromise(function() {
        console.warn('Warn: Phantom instance restart');
        self._phantomRestart();
      });
    }

  },

  _cancelPhantomRestartDelay: function() {
    this._phantomRestartDelayId && clearTimeout(this._phantomRestartDelayId);
    this._phantomRestartDelayId = null;
  },

  _resetTtlTimeout: function() {
    var
      self = this;

    this._cancelTtlTimeout();
    this._ttlTimeoutId = setTimeout(
      function() {
        if (self.deferred) {
          self.deferred.promise(function() {
            self._phantomRestart();
          });
        }
        else {
          self._phantomRestart();
        }
      },
      this.ttl + Math.ceil(Math.random() * this.ttl * PHANTOM_TTL_SPREAD_FACTOR)
    )
  },

  _cancelTtlTimeout: function() {
    this._ttlTimeoutId && clearTimeout(this._ttlTimeoutId);
    this._ttlTimeoutId = null;
  },


  _apply: function() {
    var
      self = this,
      deferred,
      url,
      finished = false,
      requestOptions,
      requestTime = Date.now(),
      responseTime = null,
      unlink,
      req
      ;

    if (!this.deferred || this._applyPending || !this._phantom || !this._phantom.isReady()) {
      return;
    }
    this._applyPending = true;

    deferred = this.deferred;
    url = deferred.url;

    unlink = deferred.promise(function() {
      finished = true;
      self._applyPending = false;
      self._abortImpressAttempt();
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
      if (finished) {
        return;
      }
      finished = true;
      self._phantomRestart();
      unlink && unlink();
    }

    function done(result) {
      self._abortImpressAttempt();
      if (finished) {
        return;
      }
      self._performImpressReport(result);
      finished = true;
      self.htmlFilter.apply(result.content, function(err, content) {
        if (err) {
          console.error('Error: Html filter error', err);
        }
        else {
          result.content = content;
        }
        deferred.finish(null, result);
      });
    }

    requestOptions = {
      port: this._phantom.serverPort,
      path: '/?' + qs.stringify({ url: url })
    };

    try {
      req = http.request(requestOptions, function(res) {
        var
          result = '';
        if (finished) {
          return;
        }

        if (res.statusCode != 200) {
          console.error('Error request to impress server with http status code', res.statusCode);
          retry();
          return;
        }
        res.on('error', function(error) {
          if (finished) {
            return;
          }
          console.error('Impress request error', error);
          retry();
        });

        res.on('data', function(chunk) {
          if (finished) {
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

          self._impressRequest = null;

          if (finished) {
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
            console.log('OK page', result.httpStatusCode, '"' + url + '"', 'in time', responseTime, 'ms');
            done(result);
          }
        });

      });
      req.on('error', function(error) {
        if (finished) {
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
  }



};
