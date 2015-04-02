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
      index
      ;

    for (index = 0; index < queue.length; index++) {
      if (queue[index].url == url) {
        return queue[index];
      }
    }
    deferred = new ImpressDeferred(url, this.options);

    this.queue.push(deferred);
    console.log('STATUS Queue size:', this.queue.length, '+');
    this.pool.digest();

    return deferred;
  },

  poll: function() {
    var
      deferred = this.queue.shift();
    console.log('STATUS Queue size:', this.queue.length, '-');
    return deferred;
  },

  _registerPoolWatcher: function() {
    var
      queue = this,
      pool = this.pool;

    this.pool.watch(function() {
      if (!pool.hasLimit() && !queue.isEmpty()) {
        pool.add(queue.poll());
      }
    });
  }

};
