
module.exports = NullStorage;

function NullStorage(options) {
  this.options = options || {};
}

NullStorage.prototype = {

  get: function(key, callback) {
    callback && callback();
  },

  put: function(value, callback) {
    callback && callback(null, value);
  }

};