const
  DEFAULT_TIMEOUT = 90000,
  TIMEOUT_APPENDIX = 200;


module.exports = ImpressDeferred;

function ImpressDeferred(url, options) {
  options = options || {};

  this.url = url;
  this.pending = true;
  this.watchers = [];
  this.postResolveListeners = [];
  this.error = null;
  this.result = null;

  this.createdTime = Date.now();
  this.timeout = options.maxDeferredTimeout || DEFAULT_TIMEOUT;

  this._initPromise();
  this._startTimeout();
}

ImpressDeferred.prototype = {

  _startTimeout: function() {
    var
      self = this;

    if (!this.timeoutId) {
      this.timeoutId = setTimeout(
        function() {
          self.reject('FAIL page "' + self.url + '" deferred timeout ' + self.timeout);
        },
        this.timeout + TIMEOUT_APPENDIX
      );
    }
  },

  _stopTimeout: function() {
    this.timeoutId && clearTimeout(this.timeoutId);
  },

  destroy: function() {
    this._stopTimeout();
    this.watchers = undefined;
    this.promise = undefined;
    this.result = undefined;
    this.error = undefined;
    this.postResolveListeners = undefined;
  },

  _initPromise: function() {
    var
      self = this,
      noop = function() {};

    this.promise = function(fn) {
      if (!self.pending) {
        fn && fn(self.error, self.result);
        return noop;
      }
      if (typeof fn == 'function') {
        self.watchers.push(fn);
      }
      return function() {
        var
          position;
        while( (position = self.watchers.indexOf(fn)) != -1 ) {
          self.watchers.splice(position, 1);
        }
      }
    };
  },

  resolve: function(result) {
    this.finish(null, result);
  },

  reject: function(error) {
    this.finish(error);
  },

  finish: function(error, result) {
    var
      watchers,
      postResolveListeners;

    if (!this.pending) {
      return;
    }
    this.pending = false;
    this._stopTimeout();

    this.error = error;
    this.result = result;

    watchers = this.watchers;
    watchers.forEach(function(fn) {
      try {
        fn && fn(error, result);
      }
      catch(e) {
        console.error(e);
      }
    });

    postResolveListeners = this.postResolveListeners;
    postResolveListeners.forEach(function(fn) {
      try {
        fn && fn();
      }
      catch(e) {
        console.error(e);
      }
    });
    postResolveListeners.length = 0;
  },

  postResolve: function(fn) {
    if (!this.pending) {
      fn && fn();
      return;
    }
    if (typeof fn == 'function') {
      this.postResolveListeners.unshift(fn);
    }
  }

};
