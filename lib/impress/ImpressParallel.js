var
  os = require('os'),
  ImpressInstancePool = require('./ImpressInstancePool')
  ;

module.exports = ImpressParallel;

function ImpressParallel(options) {
  options = options || {};

  this.options = options;
  this.maxSize = options.maxParallel || os.cpus().length * 2;

  this.pool = new ImpressInstancePool(options);
  this.parallel = [];
  this.watchers = [];
}

ImpressParallel.prototype = {

  hasLimit: function() {
    return this.parallel.length >= this.maxSize;
  },

  add: function(deferred) {
    var
      self = this,
      pool = this.parallel,
      promise,
      instance = this.pool.getInstance(deferred);

    this.parallel.push(instance);
    instance.run();

    promise = deferred.promise;
    promise(function() {
      var
        position,
        finished;
      while( (position = pool.indexOf(instance)) != -1 ) {
        finished = pool.splice(position, 1)[0];
        if (finished) {
          self.pool.releaseInstance(finished);
        }
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
