const
  DEFAULT_RELEASE_DELAY = 10000;

module.exports = InstancePortPool;

function InstancePortPool(options) {
  this.options = options || {};

  this.phantomPortLow = options.phantomPortLow || 8498;
  this.phantomPortHigh = options.phantomPortHigh || 8598;

  this.used = {};
  this.cursor = this.phantomPortLow;
  this.delayedTimeouts = {};
}

InstancePortPool.prototype = {

  getUnusedCount: function() {
    return this.phantomPortHigh - this.phantomPortLow - Object.keys(this.used).length;
  },

  getPort: function() {
    var
      cursor = this.cursor,
      inf;

    while(this.used[cursor]) {
      cursor ++;
      if (cursor > this.phantomPortHigh) {
        cursor = this.phantomPortLow;
        if (inf) {
          throw new Error('Unused port for phantomjs server not found');
        }
        inf = true;
      }
    }
    this.used[cursor] = true;
    this.cursor = cursor;
    return cursor;
  },

  releasePort: function(port) {
    if (this.used[port]) {
      this._cancelDelayedRelease(port);
      delete this.used[port];
    }
  },

  delayedReleasePort: function(port, delay) {
    var
      self = this;

    if (!this.used[port]) {
      return;
    }

    this._cancelDelayedRelease(port);
    this.delayedTimeouts[port] = setTimeout(
      function() {
        self.releasePort(port);
      },
      delay || DEFAULT_RELEASE_DELAY
    );
  },

  _cancelDelayedRelease: function(port) {
    if (this.delayedTimeouts[port]) {
      clearTimeout(this.delayedTimeouts[port]);
      this.delayedTimeouts[port] = null;
    }
  }

};
