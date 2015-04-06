#! binary/phantomjs

var
	system = require('system'),
  Application = require('./lib/Application'),
  args = system.args,
	url = args[1];

if (args.indexOf('--url-base64-encoded') != -1) {
  try {
    url = window.atob(url);
  }
  catch(e) {
    console.log('Incorrect base64 formatted url', e);
    phantom.exit(1);
  }
}

new Application(url).run();
