const
  DEFAULT_READY_CHECK_INTERVAL = 50,
  DEFAULT_TIMEOUT = 15000,
  AUTO_READY_CHECK_DELAY = 1000
  ;

var
  EventEmitter = require('./EventEmitter'),
  HtmlSanitizer = require('./HtmlSanitizer'),
  ResourceFilter = require('./ResourceFilter'),
  inherit = require('./inherit'),
  webPage = require('webpage')
  ;


module.exports = Page;

function Page(url) {
  EventEmitter.call(this);

  this._create();

  this.url = url;

  this._outputBuffer = [];
  this._warningBuffer = [];

  this._pageWindowLoaded = false;

  this._resourceResponses = {};
  this._abortedResources = [];
  this._readyCheckInterval = DEFAULT_READY_CHECK_INTERVAL;
  this._timeout = DEFAULT_TIMEOUT;
}

inherit(Page, EventEmitter, {

  _exit: function(eventName) {
    this.stop();
    this.emit(eventName, this.getResult());
  },
  _exitOk: function() {
    this._exit('Ok');
  },
  _exitError: function() {
    this._exit('Error');
  },
  _exitPageNotFound: function() {
    this._exit('PageNotFound');
  },

  _output: function(/* ...values*/) {
    var
      args = Array.prototype.slice.call(arguments);
    this._outputBuffer.push(args.join(' '));
  },

  _warning: function(/* ...values*/) {
    var
      args = Array.prototype.slice.call(arguments);
    this._warningBuffer.push(args.join(' '));
  },

  _create: function() {
    this.page = webPage.create();
    this._webPageConfigure();
    this._webPageInitListeners();
  },

  _webPageConfigure: function() {
    this.page.settings.userAgent = 'Prerender Rimpress';
    this.page.settings.loadImages = false;
  },

  _webPageInitListeners: function() {
    this._webPageAddErrorListener();
    this._webPageAddResourceErrorListener();
    this._webPageAddResourceRequestedListener();
    this._webPageAddResourceReceivedListener();
    this._webPageAddInitializedListener();
    this._webPageAddCallbackListener();
  },

  _webPageAddErrorListener: function() {
    var
      self = this;

    this.page.onError = function(message, trace) {
      var
        messageBuilder = [
          'JS ERROR:',
          message
        ];
      if (trace && trace.length) {
        messageBuilder.push('Trace:');
        trace.forEach(function(step) {
          messageBuilder.push(
            ' -> '
            + step.file
            + ': '
            + step.line
            + (step.function
              ? ' (in function "' + step.function + '")'
              : '')
          );
        });
      }
      self._warning(messageBuilder.join('\n'));
    };

  },

  _webPageAddResourceErrorListener: function() {
    var
      self = this;

    this.page.onResourceError = function(resourceError) {
      var
        url = self.url;

      if (self._abortedResources.indexOf(resourceError.id) != -1) {
        return;
      }

      self._warning(
        'RESOURCE ERROR:',
        'Unable to load resource (#' + resourceError.id,
        'URL:' + resourceError.url + ')',
        'Error code: ' + resourceError.errorCode + '.',
        'Description: ' + resourceError.errorString
      );
      if (resourceError.url == url && resourceError.errorCode == 203) {
        self._exitPageNotFound();
        return;
      }
      self._resourceResponses[resourceError.id] = resourceError;
      self._pageReadyCheck();
    };

  },

  _webPageAddResourceRequestedListener: function() {
    var
      self = this;

    this.page.onResourceRequested = function(requestData, networkRequest) {
      if (! new ResourceFilter().check(requestData.url) ) {
        self._abortedResources.push(requestData.id);
        networkRequest.abort();
      }
      else {
        self._resourceResponses[requestData.id] = null;
        self._pageReadyCheck();
      }
    };
  },

  _webPageAddResourceReceivedListener: function() {
    var
      self = this;

    this.page.onResourceReceived = function(response) {
      self._resourceResponses[response.id] = response;
      self._pageReadyCheck();
    };
  },

  _webPageAddInitializedListener: function() {
    var
      self = this;

    this.page.onInitialized = function() {
      self._webPageAddOnLoadCallback();
    };
  },

  _webPageAddCallbackListener: function() {
    var
      self = this;

    this.page.onCallback = function(data) {
      data = data || {};
      if (data.load) {
        self._pageWindowLoaded = true;
        self._pageReadyCheck();
      }
    };
  },

  _webPageAddOnLoadCallback: function() {
    try {
      this.page.evaluate(function() {
        window.addEventListener('load', function() {
          if (typeof window.callPhantom === 'function') {
            window.callPhantom({ load: true });
          }
        }, false);
      });
    }
    catch(e) {
      this._output('Could not evaluate js on page', this.url, e);
      this._exitError();
    }
  },

  _pageReadyCheck: function() {
    var
      self = this,
      resourcesPending,
      cancelReadyDelayTimeout = true;

    if (!this._hasReadyFlag()) {
      if (this._pageWindowLoaded) {
        resourcesPending = false;
        Object.keys(this._resourceResponses)
          .forEach(function(key) {
            if (!self._resourceResponses[key]) {
              resourcesPending = true;
            }
          });
        if (!resourcesPending) {
          cancelReadyDelayTimeout = false;
          if (!self._readyCheckDelayTimeoutId) {
            self._readyCheckDelayTimeoutId = setTimeout(function() {
              if (!self._getReadyFlag()) {
                self._warning('WARNING: Prerender or rimpress ready flags not defined');
                self._success();
              }
            }, AUTO_READY_CHECK_DELAY)
          }
        }
      }
    }
    else if (this._getReadyFlag()) {
      this._success();
    }

    if (cancelReadyDelayTimeout) {
      this._cancelReadyCheckDelayTimeout();
    }
  },

  _cancelReadyCheckDelayTimeout: function() {
    this._readyCheckDelayTimeoutId && clearTimeout(this._readyCheckDelayTimeoutId);
    this._readyCheckDelayTimeoutId = null;
  },

  _startTimeout: function() {
    var
      self = this;
    this._timeoutId = setTimeout(
      function() {
        self._output('Timeout', self._timeout);
        self._exitError();
      },
      self._timeout
    );
  },

  _cancelTimeout: function() {
    clearTimeout(this._timeoutId);
  },

  _startReadyFlagChecker: function() {
    var
      self = this;

    this._checkerIntervalId = setInterval(function() {
      if (self._hasReadyFlag()) {
        self._pageReadyCheck();
      }
    }, this._readyCheckInterval);
  },

  _stopReadyFlagChecker: function() {
    clearInterval(this._checkerIntervalId);
  },

  _success: function() {
    this._output(new HtmlSanitizer(this.page.content).getContent());
    this._exitOk();
  },

  _getReadyFlag: function() {
    try {
      return this.page.evaluate(function() {
        return window.prerenderReady || window.rimpressReady;
      });
    }
    catch(e) {
      this._output('Could not get prerender or rimpress ready flags value from page', e);
      this._exitError();
    }
    return null;
  },

  _hasReadyFlag: function() {
    try {
      return this.page.evaluate(function() {
        return typeof window.prerenderReady != 'undefined' || typeof window.rimpressReady != 'undefined';
      });
    }
    catch(e) {
      this._output('Could not get prerender or rimpress ready flags information from page', e);
      this._exitError();
    }
    return null;
  },

  stop: function() {
    this._cancelReadyCheckDelayTimeout();
    this._cancelTimeout();
    this._stopReadyFlagChecker();
    this.page.stop();
  },

  open: function() {
    var
      self = this;

    try {
      this.page.open(this.url, function(status) {
        if (status !== 'success') {
          self._output('Fail to load page');
          self._exitError();
          return;
        }
        self._startReadyFlagChecker();
        self._startTimeout();
      });
    }
    catch(e) {
      this._output(e);
      this._exitError();
    }
  },

  getResult: function() {
    var
      content = this._outputBuffer.join('\n'),
      position;

    if (this._warningBuffer.length) {
      if (/^\s*(<html|<!doctype)/i.test(content)) {
        position = content.lastIndexOf('</html');
        if (position != -1) {
          return content.slice(0, position)
            + '<!-- IMPRESS WARNINGS: \n' + this._warningBuffer.join('\n\n') + '\n -->'
            + content.slice(position);
        }
      }
      else {
        return content + '\n' + this._warningBuffer.join('\n');
      }
    }

    return content;
  }


});
