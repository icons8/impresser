var
  fs = require('fs');

module.exports = ResourceFilter;

function ResourceFilter(options) {
  this.options = options || {};

  this.rules = [];
  this.blockedResourcesConfig = phantom.libraryPath + '/' + (this.options.blockedResourcesConfig || 'config/blocked-resources.json');

  this._addRules();
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

  _addRules: function() {
    this._addFontRule();
    this._addBlockedResourcesRules();
  },

  _addBlockedResourcesRules: function() {
    var
      resourcesListJson = '',
      resourcesList,
      stream;

    stream = fs.open(this.blockedResourcesConfig, 'r');
    while(!stream.atEnd()) {
      resourcesListJson += stream.readLine();
    }
    resourcesList = JSON.parse(resourcesListJson);

    this.rules.push(function(url) {
      var
        match,
        _url,
        index,
        res;

      match = url.match(/^(?:https?:\/\/)?(?:www\.)?(.*)$/i);
      if (!match) {
        return true;
      }
      _url = match[1];

      for (index = 0; index < resourcesList.length; index++) {
        res = resourcesList[index];
        if (_url.slice(0, res.length) == res) {
          return false;
        }
      }

      return true;
    });
  },

  _addFontRule: function() {
    this.rules.push(function(url) {
      return !/^(https?:\/\/)?(www)?[^?]+?\.(ttf|eot|woff|woff2)([?/]|$)/i.test(url);
    });
  }

};
