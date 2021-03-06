const
  DEFAULT_TIMEOUT = 60000;

var
  logger = require('../logger');

module.exports = Deferred;

function Deferred(url, options) {
  options = options || {};

  this.url = url;
  this.pending = true;
  this.watchers = [];
  this.postResolveListeners = [];
  this.error = null;
  this.result = null;

  this.createdTime = Date.now();
  this.timeout = options.maxQueueTimeout || DEFAULT_TIMEOUT;

  this.startExecutionTime = null;
  this.executionTime = null;
  this.performTime = null;

  this._initPromise();
  this._startTimeout();
}

Deferred.prototype = {

  _startTimeout: function() {
    var
      self = this;

    if (!this.timeoutId) {
      this.timeoutId = setTimeout(
        function() {
          self.reject('FAIL page "' + self.url + '" deferred timeout ' + self.timeout);
        },
        this.timeout
      );
    }
  },

  _stopTimeout: function() {
    this.timeoutId && clearTimeout(this.timeoutId);
  },

  startExecution: function() {
    if (this.startExecutionTime) {
      return;
    }
    this.startExecutionTime = Date.now();
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
        try {
          fn && fn(self.error, self.result);
        }
        catch(e) {
          logger.error(e);
        }
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

  getRemainedTimeout: function() {
    return this.timeout - (Date.now() - this.createdTime);
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
      postResolveListeners,
      time;

    if (!this.pending) {
      return;
    }

    time = Date.now();

    this.executionTime = this.startExecutionTime
      ? time - this.startExecutionTime
      : 0;
    this.performTime = time - this.createdTime;

    this.pending = false;
    this._stopTimeout();

    this.error = error;
    this.result = result;

    if (result && typeof result == 'object') {
      result.executionTime = this.executionTime;
      result.performTime = this.performTime;
    }

    watchers = this.watchers.slice();
    this.watchers.length = 0;

    watchers.forEach(function(fn) {
      try {
        fn && fn(error, result);
      }
      catch(e) {
        logger.error(e);
      }
    });

    postResolveListeners = this.postResolveListeners.slice();
    this.postResolveListeners.length = 0;

    postResolveListeners.forEach(function(fn) {
      try {
        fn && fn();
      }
      catch(e) {
        logger.error(e);
      }
    });
  },

  postResolve: function(fn) {
    var
      self = this;
    if (!this.pending) {
      fn && fn();
      return;
    }
    if (typeof fn == 'function') {
      this.postResolveListeners.unshift(fn);
    }
    return function() {
      var
        position;
      while( (position = self.postResolveListeners.indexOf(fn)) != -1 ) {
        self.postResolveListeners.splice(position, 1);
      }
    }
  }

};
