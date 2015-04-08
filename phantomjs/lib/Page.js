const
  DEFAULT_READY_CHECK_INTERVAL = 50,
  DEFAULT_TIMEOUT = 15000,
  AUTO_READY_CHECK_DELAY = 1000
  ;

var
  EventEmitter = require('./EventEmitter'),
  HtmlSanitizeFilter = require('./HtmlSanitizeFilter'),
  ResourceFilter = require('./ResourceFilter'),
  inherit = require('./inherit'),
  webPage = require('webpage')
  ;

module.exports = Page;

function Page(url, options) {
  EventEmitter.call(this);

  options = options || {};
  this.reportNotices = options.reportNotices;
  this.report = typeof options.report == 'undefined' || options.report;

  this._init();

  this._finished = false;

  this.url = url;

  this._outputBuffer = [];
  this._warningBuffer = [];
  this._noticeBuffer = [];

  this._pageWindowLoaded = false;

  this._resourceResponses = {};
  this._abortedResources = [];
  this._readyCheckInterval = DEFAULT_READY_CHECK_INTERVAL;
  this._timeout = DEFAULT_TIMEOUT;
}

inherit(Page, EventEmitter, {

  _exit: function(eventName) {
    var
      finished = this._finished;
    this.stop();
    if (!finished) {
      this.emit(eventName, this.getResult());
    }
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

  _notice: function(/* ...values*/) {
    var
      args = Array.prototype.slice.call(arguments);
    this._noticeBuffer.push(args.join(' '));
  },

  _init: function() {
    this._webPageInit();
    this.resourceFilter = new ResourceFilter();
  },

  _webPageInit: function() {
    this.page = webPage.create();
    this._webPageConfigure();
    this._webPageInitListeners();
  },

  _webPageConfigure: function() {
    this.page.settings.userAgent = 'Prerender Impress';
    this.page.settings.loadImages = false;
  },

  _webPageInitListeners: function() {
    this._webPageAddErrorListener();
    this._webPageAddResourceErrorListener();
    this._webPageAddResourceRequestedListener();
    this._webPageAddResourceReceivedListener();
    this._webPageAddInitializedListener();
    this._webPageAddCallbackListener();
    this._webPageAddConsoleMessageListener();
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
      var
        url = self.url;

      if ( (!self.resourceFilter.check(requestData.url)) && requestData.url != url ) {
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

  _webPageAddConsoleMessageListener: function() {
    var
      self = this;

    this.page.onConsoleMessage = function(message, line, sourceId) {
      self._notice(
        'CONSOLE: ' + message +
        (line || line === 0 || sourceId
          ? ' (from line #' + line + ' in "' + sourceId + '")'
          : '')
      );
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

    if (this._finished) {
      return;
    }

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
              if (!self._hasReadyFlag()) {
                self._warning('WARNING: Prerender or impress ready flags not defined');
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
        var
          resourceResponses = self._resourceResponses,
          pendingResourcesCount
          ;

        pendingResourcesCount = Object.keys(resourceResponses)
          .filter(function(key) {
            return !resourceResponses[key];
          })
          .length;

        self._output(
          'TIMEOUT:', self._timeout,
          'Has ready flag:', self._hasReadyFlag(),
          'Ready flag value:', Boolean(self._getReadyFlag()),
          'Page window loaded:', self._pageWindowLoaded,
          'Pending resource count:', pendingResourcesCount
        );
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
    if (this._finished) {
      return;
    }
    this._output(this._getPageContent());
    this._exitOk();
  },

  _getPageContent: function() {
    try {
      return new HtmlSanitizeFilter(this.page.content).getContent();
    }
    catch(e) {
      this._output('Could not get page content', e);
      this._exitError();
    }
    return null;
  },

  _getReadyFlag: function() {
    try {
      return this.page.evaluate(function() {
        return window.prerenderReady || window.impressReady;
      });
    }
    catch(e) {
      this._output('Could not get prerender or impress ready flags value from page', e);
      this._exitError();
    }
    return null;
  },

  _hasReadyFlag: function() {
    try {
      return this.page.evaluate(function() {
        return typeof window.prerenderReady != 'undefined' || typeof window.impressReady != 'undefined';
      });
    }
    catch(e) {
      this._output('Could not get prerender or impress ready flags information from page', e);
      this._exitError();
    }
    return null;
  },

  stop: function() {
    this._finished = true;
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
      warningBlockBuilder,
      position;

    if (this._warningBuffer.length || this._noticeBuffer.length) {
      if (/^\s*(<html|<!doctype)/i.test(content)) {
        position = content.lastIndexOf('</body');
        if (position != -1) {
          warningBlockBuilder = [
            '<script type="application/impress-report+json">',
            '<![CDATA[',
            JSON.stringify({
              url: this.url,
              warnings: this._warningBuffer,
              notices: (this.reportNotices && this._noticeBuffer) || undefined
            }),
            ']]>',
            '</script>'
          ];

          return content.slice(0, position)
            + warningBlockBuilder.join('')
            + content.slice(position);
        }
      }
      else {
        return content + '\n'
          + 'IMPRESS REPORT FOR "' + this.url + '"\n'
          + (this._warningBuffer.length ? 'WARNINGS:\n' + this._warningBuffer.join('\n') + '\n' : '' )
          + (this.reportNotices && this._noticeBuffer.length ? 'NOTICES:\n' + this._noticeBuffer.join('\n') + '\n' : '' );
      }
    }

    return content;
  }


});
