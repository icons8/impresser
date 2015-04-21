
module.exports = Filter;

function Filter(filters, options) {
  this.options = options || {};

  this._filters = [];
  this._addFilters(filters);
}

Filter.prototype = {

  _addFilters: function(filters) {
    var
      self = this;

    if (!Array.isArray(filters)) {
      filters = [filters];
    }
    filters.forEach(function(filter) {
      if (filter) {
        if (typeof filter == 'object' && typeof filter.apply == 'function') {
          self._filters.push(function(content, callback) {
            try {
              if (filter.async) {
                filter.apply(content, callback);
              }
              else {
                callback && callback(null, filter.apply(content));
              }
            }
            catch(err) {
              callback && callback(err);
            }
          });
        }
        if (typeof filter == 'function') {
          self._filters.push(function(content, callback) {
            try {
              if (filter.async) {
                filter(content, callback);
              }
              else {
                callback && callback(null, filter(content));
              }
            }
            catch(err) {
              callback && callback(err);
            }
          });
        }
      }
    });
  },

  apply: function(content, finish) {
    var
      fn;

    fn = this._filters.reduce(
      function(fn, filter) {
        return function(content, callback) {
          fn(content, function(err, content) {
            if (err) {
              callback(err);
              return;
            }
            filter(content, callback);
          });
        };
      },
      function(content, callback) {
        callback(null, content);
      }
    );

    fn(content, finish);

  }

};
