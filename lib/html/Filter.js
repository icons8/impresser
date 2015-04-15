
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
          self._filters.push(function(content) {
            return filter.apply(content);
          });
        }
        if (typeof filter == 'function') {
          self._filters.push(filter);
        }
      }
    });
  },

  _applyFilters: function(content) {
    return this._filters.reduce(
      function(content, filter) {
        return filter(content);
      },
      content
    );
  },

  apply: function(content) {
    return this._applyFilters(content);
  }

};
