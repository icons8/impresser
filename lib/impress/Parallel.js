var
  os = require('os'),
  InstancePool = require('./InstancePool')
  ;

module.exports = Parallel;

function Parallel(options, htmlFilters) {
  options = options || {};

  this.options = options;
  this.maxSize = options.maxParallel || os.cpus().length * 2;

  this.pool = new InstancePool(options, htmlFilters);
  this.parallel = [];
  this.watchers = [];
}

Parallel.prototype = {

  prepare: function() {
    this.pool.preInitInstances(this.maxSize)
  },

  hasLimit: function() {
    return this.parallel.length >= this.maxSize;
  },

  add: function(deferred) {
    var
      self = this,
      parallel = this.parallel,
      promise,
      instance = this.pool.getInstance();

    this.parallel.push(instance);
    instance.run(deferred);

    promise = deferred.promise;
    promise(function() {
      var
        position;
      while( (position = parallel.indexOf(instance)) != -1 ) {
        parallel.splice(position, 1);
      }
      self.digest();
    });

    return promise;
  },

  digest: function() {
    var
      watchers = this.watchers;

    process.nextTick(function() {
      watchers.slice().forEach(function(fn) {
        fn && fn();
      });
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
