#!/usr/bin/env phantomjs

var
  ImpressPool = require('./ImpressPool'),
  ImpressDeferred = require('./ImpressDeferred')
  ;

module.exports = ImpressQueue;

function ImpressQueue(options) {
  options = options || {};

  this.pool = new ImpressPool();
  this.maxSize = options.maxSize || this.pool.maxSize * 6;

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
      deferred = new ImpressDeferred(url);

    this.queue.push(deferred);
    this.pool.digest();

    return deferred.promise();
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
      }
    });
  }

};
