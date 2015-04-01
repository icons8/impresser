var
	system = require('system'),
	page = require('webpage').create(),
	url = system.args[1];

page.settings.userAgent = 'Prerender Rimpress';

try {
	page.open(url, function(status) {
	  if (status !== 'success') {
	    console.warn('FAIL to load the address');
	    phantom.exit(3);
	  }
	  var
	  	checkerIntervalId,
	  	timeoutId;

	  checkerIntervalId = setInterval(function() {
	  	var
	  		ready;

	  	try {
	  		ready = page.evaluate(function() {
		      return window.prerenderReady;
		    });
	  	}
	  	catch(e) {
	  		console.error(e);
	  		phantom.exit(5);
	  	}

	  	if (ready) {
	  		clearInterval(checkerIntervalId);
	  		clearTimeout(timeoutId);
	  		console.log(compressHtmlFilter(removeNgAttrsFilter(removeScriptTagsFilter(page.content))));
	  		phantom.exit();
	  	}
	  }, 200);

	  timeoutId = setTimeout(function() {
	  	console.error('Timeout');
	  	phantom.exit(4);
	  }, 10000);
	});

	page.onError = function(msg, trace) {
	  var stack = ['ERROR: ' + msg];
	  if (trace && trace.length) {
	    stack.push('TRACE:');
	    trace.forEach(function(t) {
	      stack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function +'")' : ''));
	    });
	  }
	  console.error(stack.join('\n'));
	  phantom.exit(10);
	};

}
catch(e) {
	console.error(e);
	phantom.exit(2);
}

function removeNgAttrsFilter(content) {
	return content
		.replace(/\s(?:data-)?ng[:-]?[\w-]+=("[^"]+"|'[^']+'|\S+)/gi, '')
}

function removeScriptTagsFilter(content) {
	return content
		.replace(/<script(.*?)>[\S\s]*?<\/script>/gi, function(match, script) {
			return script.indexOf('application/ld+json') != -1
				? match
				: ''
		});
}

function compressHtmlFilter(content) {
	return content
		.replace(/<!--[^>]*-->/g, '') // comments
    // .replace(/>\s+</g, '><') // spaces between tags
    // .replace(/>\s\s+/g, '> ') // spaces after tags
    // .replace(/\s\s+</g, ' <')
    ;
}


