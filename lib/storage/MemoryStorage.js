
module.exports = MemoryStorage;

function MemoryStorage(options) {
  this.options = options || {};
  this._table = {};
}

MemoryStorage.prototype = {

  get: function(key, callback) {
    var
      value;
    value = this._table.hasOwnProperty(key)
      ? this._table[key]
      : null;
    callback && callback(null, value);
  },

  put: function(key, value, callback) {
    this._table[key] = value;
    callback && callback(null, value);
  }

};