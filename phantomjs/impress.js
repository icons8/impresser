#! binary/phantomjs

var
	system = require('system'),
  Application = require('./lib/Application'),
  minimist = require('../node_modules/minimist'),
  argv,
  options = {};

argv = minimist(system.args);

options.url = argv['_'][1];

if (argv['url-base64-encoded']) {
  try {
    options.url = window.atob(options.url);
  }
  catch(e) {
    console.log('Incorrect base64 formatted url', e);
    phantom.exit(10);
  }
}

options.reportNotices = argv['report-notices'];

new Application(options).run();
