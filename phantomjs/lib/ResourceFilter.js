
module.exports = ResourceFilter;

function ResourceFilter() {
  this.rules = [];
  this._addCommonFilters();
}

ResourceFilter.prototype = {

  check: function(url) {
    var
      index,
      filters = this.rules;

    url = String(url || '');
    for (index = 0; index < filters.length; index++) {
      if (!this.rules[index](url)) {
        return false;
      }
    }
    return true;
  },

  _addCommonFilters: function() {
    this._addYandexMetricaRule();
    this._addEthnioRule();
    this._addGoogleAnalyticsRule();
    this._addFontRule();
  },

  _addYandexMetricaRule: function() {
    this.rules.push(function(url) {
      return !/^(https?:\/\/)?(www)?mc\.yandex\.([a-z]{2,4})/i.test(url);
    });
  },

  _addEthnioRule: function() {
    this.rules.push(function(url) {
      return !/^(https?:\/\/)?(www)?ethn\.io/i.test(url);
    });
  },

  _addGoogleAnalyticsRule: function() {
    this.rules.push(function(url) {
      return !/^(https?:\/\/)?(www)?stats\.g\./i.test(url);
    });
  },

  _addFontRule: function() {
    this.rules.push(function(url) {
      return !/^(https?:\/\/)?(www)?[^?]+?\.(ttf|eot|woff|woff2)([?/]|$)/i.test(url);
    });
  }

};
