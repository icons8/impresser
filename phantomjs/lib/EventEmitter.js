
module.exports = EventEmitter;

function EventEmitter() {
  this._listeners = {};
}

EventEmitter.prototype = {

  emit: function(name, data) {
    var
      args = Array.prototype.slice.call(arguments, 1),
      listeners,
      index;

    if (!this._listeners[name]) {
      return;
    }
    listeners = this._listeners[name].slice();
    for (index = 0; index < listeners.length; index++) {
      listeners[index].apply(this, args);
    }
  },

  on: function(name, fn) {
    var
      self = this;

    if (!this._listeners[name]) {
      this._listeners[name] = [];
    }
    this._listeners[name].push(fn);

    return function() {
      self.off(name, fn);
    };
  },

  off: function(name, fn) {
    var
      index;
    if (!this._listeners[name]) {
      return;
    }
    for (index = 0; index < this._listeners[name].length; ) {
      if (this._listeners[name][index] === fn) {
        this._listeners[name].splice(index, 1);
      }
      else {
        index ++;
      }
    }
  }

};
