#! binary/phantomjs

const
  READY_CHECK_INTERVAL = 50,
  DEFAULT_TIMEOUT = 15000,

  ERROR_EXIT_CODE = 1,
  OK_EXIT_CODE = 0
  ;

var
	system = require('system'),
	page = require('webpage').create(),
	url = system.args[1],
  failRenderMessage = 'FAIL to render the address "' + url + '"',
  failLoadMessage = 'FAIL to load the address "' + url + '"',
  errorRenderMessage = 'ERROR to render the address "' + url + '"';

page.settings.userAgent = 'Prerender Rimpress';

try {
	page.open(url, function(status) {
	  if (status !== 'success') {
	    console.error(failLoadMessage);
	    phantom.exit(ERROR_EXIT_CODE);
	  }
	  var
	  	checkerIntervalId,
	  	timeoutId
    ;

	  checkerIntervalId = setInterval(function() {
	  	var
	  		ready;

	  	try {
	  		ready = page.evaluate(function() {
		      return window.prerenderReady;
		    });
	  	}
	  	catch(e) {
        console.error(failRenderMessage, e);
	  		phantom.exit(ERROR_EXIT_CODE);
	  	}

	  	if (ready) {
	  		clearInterval(checkerIntervalId);
	  		clearTimeout(timeoutId);
	  		console.log(htmlRemoveNgClassFilter(htmlRemoveNgAttrsFilter(htmlRemoveScriptTagsFilter(htmlCompressFilter(page.content)))));
	  		phantom.exit(OK_EXIT_CODE);
	  	}
	  }, READY_CHECK_INTERVAL);

	  timeoutId = setTimeout(
      function() {
        console.error(failRenderMessage, 'Timeout ' + DEFAULT_TIMEOUT);
        phantom.exit(ERROR_EXIT_CODE);
      },
      DEFAULT_TIMEOUT
    );
	});

	page.onError = function(message, trace) {
	  var
      messageBuilder = [
        'ERROR: ' + message
      ];

	  if (trace && trace.length) {
	    messageBuilder.push('TRACE:');
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

	  console.error(errorRenderMessage, messageBuilder.join('\n'));
	};

  page.onResourceError = function(resourceError) {
    console.error(
      errorRenderMessage,
      'Unable to load resource (#' + resourceError.id + ' URL:' + resourceError.url + ')',
      'Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString
    );
  };

}
catch(e) {
	console.error(e);
	phantom.exit(ERROR_EXIT_CODE);
}

function htmlRemoveScriptTagsFilter(content) {
  return content
    .replace(/<script(.*?)>[\S\s]*?<\/script\s*>/gi, function(match, script) {
      return script.indexOf('application/ld+json') != -1
        ? match
        : ''
    });
}

function htmlRemoveNgAttrsFilter(content) {
	return content
		.replace(/\s(?:data-)?ng[:-]?[\w-]+=("[^"]+"|'[^']+'|\S+)/gi, '')
}

function htmlRemoveNgClassFilter(content) {
  return content
    .replace(/([\s'"=])ng-(?:(?:isolate-)?scope|binding)/gi, '$1')
}

function htmlCompressFilter(content) {
	return content
		.replace(/<!--.*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/>\s\s+/g, '> ')
    .replace(/\s\s+</g, ' <')
    ;
}


