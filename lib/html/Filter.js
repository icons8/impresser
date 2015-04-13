
module.exports = Filter;

function Filter(options) {
  this.options = options || {};

  this._filters = [];
  this._addFilters(this.options.filter);
  this._addFilters(this.options.filters);
}

Filter.prototype = {

  _addFilters: function(filters) {
    var
      self = this;

    if (!Array.isArray(filters)) {
      filters = [filters];
    }
    filters.forEach(function(filter) {
      if (filter && typeof filter == 'object' && typeof filter.apply == 'function') {
        self._filters.push(filter);
      }
    });
  },

  _applyFilters: function(content) {
    return this._filters.reduce(
      function(content, filter) {
        return filter.apply(content);
      },
      content
    );
  },

  apply: function(content) {
    return this._applyFilters(content);
  }

};
