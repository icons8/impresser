#!phantomjs

var
	system = require('system'),
  Application = require('./lib/Application'),
  minimist = require('../node_modules/minimist'),
  Shell = require('./lib/Shell'),
  jsonFileReader = require('./lib/jsonFileReader'),
  argv,
  options = {},
  url,
  blockedResources;

argv = minimist(system.args);

if (argv.config) {
  options = jsonFileReader(argv.config) || {};
}

url = argv['_'][1];
if (url && argv['url-base64-encoded']) {
  try {
    url = window.atob(String(url));
  }
  catch(e) {
    Shell.exitWithError('Incorrect base64 formatted url', e);
  }
}
options.url = url || options.url;

blockedResources = argv['blocked-resources'];
if (!Array.isArray(blockedResources)) {
  blockedResources = [blockedResources];
}
blockedResources = blockedResources
  .filter(function(url) {
    return url && typeof url == 'string';
  });

if (argv['blocked-resources-base64-encoded']) {
  try {
    blockedResources = blockedResources.map(function(url) {
      return window.atob(String(url));
    });
  }
  catch(e) {
    Shell.exitWithError('Incorrect base64 formatted blocked resources', e);
  }
}

if (blockedResources.length) {
  options.blockedResources = blockedResources;
}

options.blockedResourcesConfig = argv['blocked-resources-config'] || options.blockedResourcesConfig;

options.serverPort = argv['server-port'] || options.serverPort;
options.notices = argv.notices || options.notices;
options.warnings = argv.warnings || options.warnings;
options.timeout = argv.timeout || options.timeout;

new Application(options).run();
