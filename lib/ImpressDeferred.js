
module.exports = ImpressDeferred;

function ImpressDeferred(url) {
  this.url = url;
  this.pending = true;
  this.watchers = [];
  this.error = null;
  this.result = null;
}

ImpressDeferred.prototype = {

  resolve: function(result) {
    this.finish(null, result);
  },

  reject: function(error) {
    this.finish(error);
  },

  finish: function(error, result) {
    if (!this.pending) {
      return;
    }
    this.pending = false;
    this.error = error;
    this.result = result;
    this.watchers.forEach(function(fn) {
      try {
        fn && fn(error, result);
      }
      catch(e) {
        // TODO: log it
      }
    });
  },

  promise: function() {
    var
      self = this,
      noop = function() {};

    return function(fn) {
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
    }
  }

};
