var
  HtmlSanitize = require('./HtmlSanitize')
  ;

module.exports = PageContentPerformer;

function PageContentPerformer(content) {
  this.metaHttpStatusCode = null;
  this.metaHttpHeders = {};
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
    this._htmlSanitize();
    this._parseHttpStatusCode();
    this._parseHttpStatusCode();
  },

  _htmlSanitize: function() {
    this.content = new HtmlSanitize(this.content).getContent();
  },

  _parseHttpStatusCode: function() {
    var
      metaMatch,
      httpStatusCodeMatch,
      httpStatusCode;

    metaMatch = this.content.match(/<meta[^>]*?(?:prerender|impress)-status-code[^>]*>/i);
    if (metaMatch) {
      httpStatusCodeMatch = metaMatch[0].match(/content\s*=\s*["']?\s*(\d+)/i);
      if (httpStatusCodeMatch) {
        httpStatusCode = parseInt(httpStatusCodeMatch[1]);
        if (httpStatusCode) {
          this.metaHttpStatusCode = httpStatusCode;
        }
      }
    }
  },

  _parseHttpHeaders: function() {
    var
      headers,
      metaMatches;

    headers = this.metaHttpHeders;

    metaMatches = this.content.match(/<meta[^>]*?(?:prerender|impress)-header[^>]*>/ig);
    if (metaMatches) {

      metaMatches.forEach(function(metaMatch) {
        var
          headerMatch;

        headerMatch = metaMatch.match(/content\s*=\s*(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))/i);
        if (headerMatch) {
          headerMatch = (headerMatch[1] || headerMatch[2] || headerMatch[3] || '').split(':').map(function(part) {
            return part.trim();
          });
          if (headerMatch[0]) {
            headers[headerMatch[0]] = headerMatch[1] || '';
          }
        }
      });
    }
  },

  hasMetaHttpStatusCode: function() {
    return this.metaHttpStatusCode != null;
  },

  getMetaHttpStatusCode: function() {
    return this.metaHttpStatusCode;
  },

  hasMetaHttpHeaders: function() {
    return Object.keys(this.metaHttpHeders).length > 0;
  },

  getMetaHttpHeaders: function() {
    return this.metaHttpHeders;
  }

};
