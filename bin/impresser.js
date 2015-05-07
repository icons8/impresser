#!/usr/bin/env node

'use strict';

var
  Application = require('../lib/Application'),
  yargs = require('yargs'),

  argv = yargs
    .usage('Usage: $0 [config.json[, ...config.json]] [options]')
    .describe('base-url', 'Base url for relative addresses by default http://icons8.com')
    .describe('frontend', 'Use impresser as frontend server by default true')
    .describe('proxy', 'Use proxy server for resources and not GET requests by default true')
    .describe('server-port', 'Port of impresser server by default 8497')
    .describe('force-allowed', 'Allow force header or param for force reset stored page by default false')
    .describe('storage', 'Use storage for impressed pages by default true')
    .describe('content', 'Return impressed pages content by default true')
    .describe('max-parallel', 'Limit of parallel impress instances, by default 2 on each CPU cores')
    .describe('max-queue', 'Limit of impress queue, by default 30 * "Limit of parallel impress instances.')
    .describe('max-queue-timeout', 'Max timeout for deferring in queue by default 60000')
    .describe('logging-impress-notices', 'Logging impress notices by default false')
    .describe('logging-impress-warnings', 'Logging impress warnings by default false')
    .describe('phantom-binary', 'Path to phantomjs binary file by default phantomjs command')
    .describe('phantom-ttl', 'Time to live for phantomjs instance by default 1800000')
    .describe('phantom-args', 'Add or reassign args for phantomjs command line by default "ignore-ssl-errors=true ssl-protocol=tlsv1"')
    .describe('phantom-script', 'Path to phantomjs script file by default %IMPRESS_DIR%/phantomjs/impress.js')
    .describe('phantom-port-low', 'Low bound of phantomjs server port by default 8498')
    .describe('phantom-port-high', 'High bound of phantomjs server port by default 8598')
    .describe('phantom-port-release-delay', 'Delay of release phantomjs server port by default 10000')
    .describe('phantom-exec-timeout', 'Max phantomjs execution time by default 5000')
    .describe('phantom-impress-timeout', 'Max phantomjs impress time by default 19000')
    .describe('min-phantom-restart-interval', 'Min phantomjs restart interval by default 1000')
    .describe('impress-timeout', 'Max impress execution time by default 47000')
    .describe('impress-attempt-timeout', 'Max impress attempt time by default 20000')
    .describe('impress-notices', 'Add notices to impress report by default true')
    .describe('impress-resources-logging', 'Add logging for impress resources received by default false')
    .describe('impress-warnings', 'Add warnings to impress report by default true')
    .describe('config', 'Path to config file, can be multiple')
    .help('h')
    .alias('h', 'help')
    .epilog('impresser (https://github.com/icons8/impresser)')
    .argv,

  options;

options = argv;
options.config = argv._.concat(options.config);

new Application(options).run();
