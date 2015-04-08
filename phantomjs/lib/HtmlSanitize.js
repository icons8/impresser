
module.exports = HtmlSanitize;

function HtmlSanitize(content) {
  this.setContent(content);
}

HtmlSanitize.prototype = {

  setContent: function(content) {
    this.content = String(content || '');
    this.apply();
  },

  getContent: function() {
    return this.content;
  },

  apply: function() {
    this.removeScriptTags();
  },

  removeScriptTags: function() {
    this.content = this.content
      .replace(/<script(.*?)>[\S\s]*?<\/script\s*>/gi, function(match, script) {
        return script.indexOf('application/ld+json') != -1
          ? match
          : ''
      });
  }

};
