const
  DEFAULT_READY_CHECK_INTERVAL = 50,
  DEFAULT_TIMEOUT = 10000,
  AUTO_READY_CHECK_DELAY = 1000
  ;

var
  EventEmitter = require('./EventEmitter'),
  PageContentPerformer = require('./PageContentPerformer'),
  ResourceFilter = require('./ResourceFilter'),
  inherit = require('./inherit'),
  webPage = require('webpage')
  ;

module.exports = Page;

function Page(options) {
  EventEmitter.call(this);

  options = options || {};

  this.options = options;
  this.notices = options.notices;
  this.warnings = options.warnings;
  this.resourcesLogging = options.resourcesLogging;

  this._init();

  this._startTime = null;
  this._finished = false;
  this._destroyed = false;

  this.url = options.url || '';

  this._redirectUrlList = [];
  this._location = null;

  this._outputBuffer = '';
  this._errorBuffer = [];
  this._warningBuffer = [];
  this._noticeBuffer = [];

  this._httpStatusCode = null;
  this._httpHeaders = null;
  this._contentType = null;
  this._ok = false;

  this._pageWindowLoaded = false;
  this._pageUrlMissedFragmentFixing = false;
  this._pageUrlMissedFragmentRedirectUrl = null;

  this._resourceResponses = {};
  this._abortedResources = [];
  this._readyCheckInterval = DEFAULT_READY_CHECK_INTERVAL;
  this._timeout = options.timeout || DEFAULT_TIMEOUT;
}

inherit(Page, EventEmitter, {

  _setNetworkReplyErrorCode: function(errorCode) {
    // @see http://doc.qt.io/qt-5/qnetworkreply.html
    switch(errorCode) {
      case 203:
        this._httpStatusCode = 404;
        break;
      case 201:
        this._httpStatusCode = 401;
        break;
      case 0:
        this._httpStatusCode = 200;
        break;
      case 4:
        this._httpStatusCode = 504;
        break;
      default:
        this._httpStatusCode = 500;
    }
  },

  _exit: function() {
    var
      finished = this._finished;
    this._finish();
    if (!finished) {
      this._notice('Page execution time:', Date.now() - this._startTime, 'ms');
      this.emit('exit', this.getResult());
    }
  },

  _exitOk: function() {
    if (this._finished) {
      return;
    }
    this._ok = true;
    if (!this._httpStatusCode) {
      this._httpStatusCode = 200;
    }
    this._exit();
  },

  _exitFail: function() {
    if (this._finished) {
      return;
    }
    this._ok = false;
    this._exit();
  },

  _output: function(/* ...values*/) {
    var
      args = Array.prototype.slice.call(arguments);
    this._outputBuffer += args.join(' ');
  },

  _error: function(/* ...values*/) {
    var
      args = Array.prototype.slice.call(arguments);
    this._errorBuffer.push(args.join(' '));
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
    this.resourceFilter = new ResourceFilter(this.options);
  },

  _webPageInit: function() {
    this.page = webPage.create();
    this._webPageConfigure();
    this._webPageInitListeners();
  },

  _webPageConfigure: function() {
    this.page.settings.userAgent = 'Prerender Impress Impresser';
    this.page.settings.loadImages = false;
    this.page.settings.clearMemoryCaches = true;
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

      if (self._abortedResources.indexOf(resourceError.id) != -1 || self._pageUrlMissedFragmentFixing) {
        return;
      }

      self._warning(
        'RESOURCE ERROR:',
        'Unable to load resource (#' + resourceError.id,
        'URL:' + resourceError.url + ')',
        'Error code: ' + resourceError.errorCode + '.',
        'Description: ' + resourceError.errorString
      );
      if (resourceError.url == url || self._redirectUrlList.indexOf(resourceError.url) != -1) {
        self._setNetworkReplyErrorCode(resourceError.errorCode);
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

      if ( (!self.resourceFilter.check(requestData.url)) && requestData.url != url && self._redirectUrlList.indexOf(requestData.url) == -1 ) {
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
      var
        url = self.url,
        status;

      if (response.url == url || self._redirectUrlList.indexOf(response.url) != -1) {
        self._contentType = response.contentType;
        if (response.stage == 'start') {
          status = self._detectResourceUrlMissedFragment(response);
          if (response.redirectURL) {
            self._redirectUrlList.push(
              status.detected
                ? status.fixedRedirectUrl
                : response.redirectURL
            );
          }
          if (status.detected) {
            self._resourceResponses[response.id] = response;
            self._fixPageUrlMissedFragment(status.fixedRedirectUrl);
            return;
          }
        }
      }

      if (response.stage == 'end') {
        self._resourceResponses[response.id] = response;
        if (self.resourcesLogging && response.url) {
          self._notice('Resource received:', response.id, response.url);
        }
      }
      self._pageReadyCheck();
    };
  },

  _webPageAddInitializedListener: function() {
    var
      self = this;

    this.page.onInitialized = function() {
      self._pageWindowLoaded = false;
      self._webPageAddOnLoadCallback();
      self._webPageClearPersistentData();
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
      this._error('Could not evaluate js on page', this.url, e);
      this._exitFail();
    }
  },

  _detectResourceUrlMissedFragment: function(resource) {
    var
      result = {},
      position,
      fragment,
      url = resource.url,
      redirectUrl = resource.redirectURL,
      fixedRedirectUrl;

    if (url && redirectUrl) {
      position = url.indexOf('#');
      if (position != -1) {
        fragment = url.slice(position);

        result.detected = fragment.length > 1
          ? redirectUrl.slice(-fragment.length) !== fragment
          : false;

        if (result.detected) {
          position = redirectUrl.indexOf('#');
          fixedRedirectUrl = position != -1
            ? redirectUrl.slice(0, position)
            : redirectUrl;
          fixedRedirectUrl += fragment;

          result.fixedRedirectUrl = fixedRedirectUrl;
          result.redirectUrl = redirectUrl;
        }
      }
    }

    return result;
  },

  _webPageClearPersistentData: function() {
    try {
      this.page.clearCookies();
      this.page.evaluate(function() {
        try {
          localStorage.clear();
        }
        catch(e) {}
        try {
          sessionStorage.clear();
        }
        catch(e) {}
      });
    }
    catch(e) {
      this._warning('Could not clear persistent data for page', this.url, e);
    }
  },

  _pageReadyCheck: function() {
    var
      self = this,
      resourcesPending,
      cancelReadyDelayTimeout = true;

    if (this._finished || this._destroyed) {
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

    if (this._finished || this._destroyed) {
      return;
    }

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

        self._error(
          'TIMEOUT:', self._timeout,
          'Has ready flag:', self._hasReadyFlag(),
          'Ready flag value:', Boolean(self._getReadyFlag()),
          'Page window loaded:', self._pageWindowLoaded,
          'Pending resource count:', pendingResourcesCount
        );
        self._exitFail();
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

    if (this._finished || this._destroyed) {
      return;
    }

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
    this._performPageContent();
    this._exitOk();
  },

  _performPageContent: function() {
    var
      performer;

    try {
      this._location = this._getLocation();
      performer = new PageContentPerformer(this.page.content);
      this._output(performer.getContent());
      if (performer.hasMetaHttpStatusCode()) {
        this._httpStatusCode = performer.getMetaHttpStatusCode();
      }
      if (performer.hasMetaHttpHeaders()) {
        this._httpHeaders = performer.getMetaHttpHeaders();
      }
    }
    catch(e) {
      this._error('Could not get page content', e);
      this._exitFail();
    }
  },

  _getReadyFlag: function() {
    try {
      return this.page.evaluate(function() {
        return window.prerenderReady || window.impressReady || window.impresserReady;
      });
    }
    catch(e) {
      this._error('Could not get prerender or impress ready flags value from page', e);
      this._exitFail();
    }
    return null;
  },

  _hasReadyFlag: function() {
    try {
      return this.page.evaluate(function() {
        return typeof window.prerenderReady != 'undefined'
          || typeof window.impressReady != 'undefined'
          || typeof window.impresserReady != 'undefined';
      });
    }
    catch(e) {
      this._error('Could not get prerender or impress ready flags information from page', e);
      this._exitFail();
    }
    return null;
  },

  _getLocation: function() {
    try {
      return this.page.evaluate(function() {
        return window.location.href;
      });
    }
    catch(e) {
      this._warning('Could not get page location', e);
    }
    return null;
  },

  _fixPageUrlMissedFragment: function(fixedUrl) {
    this._pageUrlMissedFragmentFixing = true;
    this._pageUrlMissedFragmentRedirectUrl = fixedUrl;
    this._stop();
  },

  _finish: function() {
    this._finished = true;
    this._stop();
  },

  _stop: function() {
    this._cancelReadyCheckDelayTimeout();
    this._cancelTimeout();
    this._stopReadyFlagChecker();
    this.page.stop();
  },

  open: function(url) {
    var
      self = this;

    url = url || this.url;
    this._startTime = Date.now();

    try {
      this._startTimeout();
      if (this.page.clearMemoryCache) {
        try {
          this.page.clearMemoryCache();
        }
        catch(e) {
          this._warning('Could not get clear memory cache for page', url, e);
        }
      }
      this._notice('Open', url);
      this.page.open(url, function(status) {
        if (self._pageUrlMissedFragmentFixing) {
          self._pageUrlMissedFragmentFixing = false;
          self._pageWindowLoaded = false;
          self._resourceResponses = {};
          self._abortedResources = [];
          self.open(self._pageUrlMissedFragmentRedirectUrl);
          return;
        }
        if (status !== 'success') {
          self._error('Fail to load page');
          self._exitFail();
          return;
        }

        self._startReadyFlagChecker();
      });
    }
    catch(e) {
      this._error(e);
      this._exitFail();
    }
  },

  getResult: function() {
    return {
      url: this.url,
      redirectUrlList: this._redirectUrlList,
      location: this._location || null,
      ok: this._ok,
      httpStatusCode: this._httpStatusCode,
      httpHeaders: this._httpHeaders,
      contentType: this._contentType,
      content: this._ok
        ? this._outputBuffer
        : undefined,
      errors: !this._ok
        ? this._errorBuffer
        : undefined,
      warnings: this.warnings && this._ok
        ? this._warningBuffer
        : undefined,
      notices: this.notices && this._ok
        ? this._noticeBuffer
        : undefined
    };
  },

  destroy: function() {
    this._destroyed = true;
    this._redirectUrlList = null;
    this._httpHeaders = null;
    this._httpStatusCode = null;
    this._outputBuffer = null;
    this._errorBuffer = null;
    this._warningBuffer = null;
    this._noticeBuffer = null;
    this._resourceResponses = null;
    this._abortedResources = null;
    this._pageUrlMissedFragmentRedirectUrl = null;
    this._pageUrlMissedFragmentFixing = false;
    this.page.close();
  }


});
