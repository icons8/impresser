var
  HTMLParser = require('html-minifier/dist/htmlminifier.js').HTMLParser;

module.exports = CompressorAngular;

function CompressorAngular(content, options) {
  this.options = options || {};
  this.setContent(content);
}

CompressorAngular.prototype = {

  setContent: function(content) {
    this.content = String(content || '');
    this.apply();
  },

  getContent: function() {
    return this.content;
  },

  apply: function() {
    var
      content = '';

    new HTMLParser(this.content, {
      html5: typeof this.options.html5 !== 'undefined' ? this.options.html5 : true,

      start: function(tag, attrs, unary) {
        var
          attrIndex,
          attrName,
          attrValue,
          classNameBuilder,
          classList,
          className,
          classIndex;

        content += '<' + tag;
        for (attrIndex = 0; attrIndex < attrs.length; attrIndex++) {
          attrName = attrs[attrIndex].name;
          if (/^(?:data-)?ng[:-]?[\w-]+$/i.test(attrName)) {
            continue;
          }
          attrValue = String(attrs[attrIndex].escaped || '');
          if (attrName == 'class') {
            classList = attrValue.split(/\s+/);
            classNameBuilder = [];
            for (classIndex = 0; classIndex < classList.length; classIndex++) {
              className = classList[classIndex];
              if (/^ng-(?:(?:isolate-)?scope|binding|animate)$/i.test(className)) {
                continue;
              }
              classNameBuilder.push(className);
            }
            attrValue = classNameBuilder.join(' ');
          }
          content += ' ' + attrName + '="' + attrValue + '"';
        }

        content += (unary ? '/' : '') + '>';
      },
      end: function(tag) {
        content += '</' + tag + '>';
      },
      chars: function(text) {
        content += text;
      },
      comment: function(text) {
        content += '<!--' + text + '-->';
      },
      ignore: function(text) {
        content += text;
      },
      doctype: function(doctype) {
        content += doctype;
      }
    });

    this.content = content;
  }

};
