var
  Parallel = require('./Parallel'),
  Deferred = require('./Deferred')
  ;

module.exports = Queue;

function Queue(options, htmlFilters) {
  options = options || {};

  this.options = options;
  this.parallel = new Parallel(options, htmlFilters);
  this.maxSize = options.maxQueue || this.parallel.maxSize * 30;

  this.queue = [];
  this._registerPoolWatcher();
}

Queue.prototype = {

  prepare: function() {
    this.parallel.prepare();
  },

  hasLimit: function() {
    return this.queue.length >= this.maxSize;
  },

  isEmpty: function() {
    return this.queue.length == 0;
  },

  add: function(url) {
    var
      deferred,
      queue = this.queue,
      parallel = this.parallel.parallel,
      index
      ;

    for (index = 0; index < queue.length; index++) {
      if (queue[index].url == url) {
        return queue[index];
      }
    }
    for (index = 0; index < parallel.length; index++) {
      if (parallel[index].deferred.url == url) {
        return parallel[index].deferred;
      }
    }
    deferred = new Deferred(url, this.options);

    this.queue.push(deferred);
    this.parallel.digest();

    return deferred;
  },

  pull: function() {
    return this.queue.shift();
  },

  _registerPoolWatcher: function() {
    var
      queue = this,
      parallel = this.parallel;

    this.parallel.watch(function() {
      if (!parallel.hasLimit() && !queue.isEmpty()) {
        parallel.add(queue.pull());
        console.log(
          'STATUS Queue size:', queue.queue.length, '>',
          'Parallel:', parallel.parallel.length,
          'Pool:', parallel.pool.pool.length,
          'Unused ports', parallel.pool.portPool.getUnusedCount()
        );
      }
      else {
        console.log('STATUS Queue size:', queue.queue.length);
      }
    });
  }

};
