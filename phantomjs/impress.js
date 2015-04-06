#! binary/phantomjs

var
	system = require('system'),
  Application = require('./lib/Application'),
  minimist = require('../node_modules/minimist'),
	url,
  argv;

argv = minimist(system.args);
url = argv['_'][1];

if (argv['url-base64-encoded']) {
  try {
    url = window.atob(url);
  }
  catch(e) {
    console.log('Incorrect base64 formatted url', e);
    phantom.exit(1);
  }
}

new Application(url).run();
