var
  minify = require('html-minifier/dist/htmlminifier.js').minify,
  CompressorAngular = require('./CompressorAngular')
  ;

module.exports = Compressor;

function Compressor(content) {
  this.setContent(content);
}

Compressor.prototype = {

  setContent: function(content) {
    this.content = String(content || '');
    this.apply();
  },

  getContent: function() {
    return this.content;
  },

  apply: function() {
    this.htmlAngularMinify();
    this.htmlMinify();
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
    });
  },

  htmlAngularMinify: function() {
    this.content = new CompressorAngular(this.content).getContent();
  }

};
