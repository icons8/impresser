
module.exports = HtmlSanitizer;

function HtmlSanitizer(content) {
  this.setContent(content);
}

HtmlSanitizer.prototype = {

  setContent: function(content) {
    this.content = String(content || '');
    this.filter();
    return this;
  },

  getContent: function() {
    return this.content;
  },

  filter: function() {
    this.compressFilter();
    this.removeScriptTagsFilter();
    this.removeNgAttrsFilter();
    this.removeNgClassFilter();
    return this;
  },

  compressFilter: function() {
    this.content = this.content
      .replace(/<!--[\S\s]*?-->/g, '')
      .replace(/>\s+</g, '><')
      .replace(/>\s\s+/g, '> ')
      .replace(/\s\s+</g, ' <')
      ;
    return this;
  },

  removeNgClassFilter: function() {
    this.content = this.content
      .replace(/([\s'"=])ng-(?:(?:isolate-)?scope|binding)/gi, '$1');
    return this;
  },

  removeNgAttrsFilter: function() {
    this.content = this.content
      .replace(/\s(?:data-)?ng[:-]?[\w-]+=(?:"[^"]+"|'[^']+'|\S+)/gi, '');
    return this;
  },

  removeScriptTagsFilter: function() {
    this.content = this.content
      .replace(/<script(.*?)>[\S\s]*?<\/script\s*>/gi, function(match, script) {
        return script.indexOf('application/ld+json') != -1
          ? match
          : ''
      });
    return this;
  }


};
