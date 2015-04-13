var
  jsonFileReader = require('./jsonFileReader');

module.exports = ResourceFilter;

function ResourceFilter(options) {
  this.options = options || {};

  this.rules = [];
  this.blockedResources = options.blockedResources;
  this.blockedResourcesConfig = options.blockedResourcesConfig;

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

  _getBlockedResourcesFromConfig: function() {
    return jsonFileReader(this.blockedResourcesConfig);
  },

  _getBlockedResources: function() {
    if (this.blockedResources) {
      return this.blockedResources;
    }
    if (this.blockedResourcesConfig) {
      return this._getBlockedResourcesFromConfig();
    }
    return null;
  },

  _addBlockedResourcesRules: function() {
    var
      resources,
      regExpBuilder = [],
      regExp;

    resources = this._getBlockedResources();
    if (!resources) {
      return;
    }

    regExpBuilder.push(
      '^(?:https?:\\/\\/)?[^?/]*?',
      '(?:',
      resources
        .map(function(res) {
          return regExpQuote(res).trim();
        })
        .filter(function(res) {
          return res;
        })
        .join('|'),
      ')'
    );

    regExp = new RegExp(regExpBuilder.join(''), 'i');

    this.rules.push(function(url) {
      return !regExp.test(url);
    });

    function regExpQuote(str) {
      // @see http://phpjs.org/functions/preg_quote/
      return String(str || '').replace(/[.\\+*?\[\^\]$(){}=!<>|:-]/g, '\\$&');
    }
  },

  _addFontRule: function() {
    this.rules.push(function(url) {
      return !/^(https?:\/\/)?(www)?[^?]+?\.(ttf|eot|woff|woff2)([?/]|$)/i.test(url);
    });
  }

};
