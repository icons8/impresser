var
  ImpressPool = require('./ImpressPool'),
  ImpressDeferred = require('./ImpressDeferred')
  ;

module.exports = ImpressQueue;

function ImpressQueue(options) {
  options = options || {};

  this.options = options;
  this.pool = new ImpressPool(options);
  this.maxSize = options.queueMaxSize || this.pool.maxSize * 50;

  this.queue = [];
  this._registerPoolWatcher();
}

ImpressQueue.prototype = {

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
      pool = this.pool.pool,
      index
      ;

    for (index = 0; index < queue.length; index++) {
      if (queue[index].url == url) {
        return queue[index];
      }
    }
    for (index = 0; index < pool.length; index++) {
      if (pool[index].deferred.url == url) {
        return pool[index].deferred;
      }
    }
    deferred = new ImpressDeferred(url, this.options);

    this.queue.push(deferred);
    this.pool.digest();

    return deferred;
  },

  poll: function() {
    return this.queue.shift();
  },

  _registerPoolWatcher: function() {
    var
      queue = this,
      pool = this.pool;

    this.pool.watch(function() {
      if (!pool.hasLimit() && !queue.isEmpty()) {
        pool.add(queue.poll());
        console.log('STATUS Queue size:', queue.queue.length, '>', 'Pool size: ', pool.pool.length);
      }
      else {
        console.log('STATUS Queue size:', queue.queue.length, 'Pool size: ', pool.pool.length);
      }
    });
  }

};
