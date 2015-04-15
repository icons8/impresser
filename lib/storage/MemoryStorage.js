
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

  put: function(value, callback) {
    value = value || {};
    value.url = value.url || '';
    this._table[value.url] = value;
    callback && callback(null, value);
  }

};