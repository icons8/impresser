var
  HtmlSanitize = require('./HtmlSanitize')
  ;

module.exports = PageContentPerformer;

function PageContentPerformer(content) {
  this.metaHttpStatusCode = null;
  this.setContent(content);
}

PageContentPerformer.prototype = {

  setContent: function(content) {
    this.content = String(content || '');
    this.apply();
  },

  getContent: function() {
    return this.content;
  },

  apply: function() {
    var
      metaMatch,
      httpStatusCodeMatch,
      httpStatusCode;

    this.content = new HtmlSanitize(this.content).getContent();

    metaMatch = this.content.match(/<meta[^>]*?(?:prerender|impress)-status-code[^>]*>/i);
    if (metaMatch) {
      httpStatusCodeMatch = metaMatch[0].match(/content=["']?(\d+)/i);
      if (httpStatusCodeMatch) {
        httpStatusCode = parseInt(httpStatusCodeMatch[1]);
        if (httpStatusCode) {
          this.metaHttpStatusCode = httpStatusCode;
        }
      }
    }
  },

  hasMetaHttpStatusCode: function() {
    return this.metaHttpStatusCode != null;
  },

  getMetaHttpStatusCode: function() {
    return this.metaHttpStatusCode;
  }

};
