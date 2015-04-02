var
  os = require('os'),
  ImpressInstance = require('./ImpressInstance')
  ;

module.exports = ImpressPool;

function ImpressPool(options) {
  options = options || {};

  this.options = options;
  this.maxSize = options.poolMaxSize || os.cpus().length * 4;

  this.pool = [];
  this.watchers = [];
}

ImpressPool.prototype = {

  hasLimit: function() {
    return this.pool.length >= this.maxSize;
  },

  add: function(deferred) {
    var
      self = this,
      pool = this.pool,
      promise,
      instance = new ImpressInstance(deferred, this.options);

    this.pool.push(instance);
    try {
      instance.run();
    }
    catch(error) {
      deferred.reject(error);
    }

    promise = deferred.promise;
    promise(function() {
      var
        position,
        garbage;
      while( (position = pool.indexOf(instance)) != -1 ) {
        garbage = pool.splice(position, 1)[0];
        garbage && garbage.destroy();
      }
      self.digest();
    });

    return promise;
  },

  digest: function() {
    this.watchers.forEach(function(fn) {
      fn && fn();
    });
  },

  watch: function(fn) {
    var
      watchers = this.watchers;

    if (typeof fn == 'function') {
      this.watchers.push(fn);
    }
    return function() {
      var
        position;
      while( (position = watchers.indexOf(fn)) != -1 ) {
        watchers.splice(position, 1);
      }
    }
  }

};
