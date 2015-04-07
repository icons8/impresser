
var
  minify = require('../../node_modules/html-minifier/dist/htmlminifier.js').minify,
  HtmlAngularFilter = require('./filters/HtmlAngularFilter');

module.exports = HtmlSanitizeFilter;

function HtmlSanitizeFilter(content) {
  this.setContent(content);
}

HtmlSanitizeFilter.prototype = {

  setContent: function(content) {
    this.content = String(content || '');
    this.apply();
  },

  getContent: function() {
    return this.content;
  },

  apply: function() {
    this.removeScriptTags();
    this.removeAngularGarbage();
    this.htmlMinify();
  },

  removeScriptTags: function() {
    this.content = this.content
      .replace(/<script(.*?)>[\S\s]*?<\/script\s*>/gi, function(match, script) {
        return script.indexOf('application/ld+json') != -1
          ? match
          : ''
      });
  },

  htmlMinify: function() {
    this.content = minify(this.content, {
      removeComments: true,
      removeCommentsFromCDATA: true,
      removeCDATASectionsFromCDATA: true,
      collapseWhitespace: true,
      collapseBooleanAttributes: true,
      removeAttributeQuotes: true,
      removeRedundantAttributes: true,
      removeStyleLinkTypeAttributes: true,
      keepClosingSlash: true,
      caseSensitive: true
    })
  },

  removeAngularGarbage: function() {
    this.content = new HtmlAngularFilter(this.content).getContent();
  }

};
