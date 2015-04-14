#!/usr/bin/env node

'use strict';

var
  Application = require('../lib/Application'),
  yargs = require('yargs'),

  argv = yargs
    .usage('Usage: $0 [options]')
    .describe('base-url', 'Base url for proxy addresses by default http://icons8.com')
    .describe('frontend', 'Use impress as frontend server by default true')
    .describe('proxy', 'Use proxy server for resources and not GET requests by default true')
    .describe('server-port', 'Port of impress server by default 8497')
    .describe('max-parallel', 'Limit of parallel impress instances, by default 2 on each CPU cores')
    .describe('max-queue', 'Limit of impress queue, by default 30 * "Limit of parallel impress instances.')
    .describe('max-queue-timeout', 'Max timeout for deferring in queue by default 60000')
    .describe('phantom-binary', 'Path to phantomjs binary file by default phantomjs command')
    .describe('phantom-args', 'Add or reassign args for phantomjs command line by default "ignore-ssl-errors=true ssl-protocol=tlsv1"')
    .describe('phantom-script', 'Path to phantomjs script file by default %IMPRESS_DIR%/phantomjs/impress.js')
    .describe('phantom-port-low', 'Low bound of phantomjs server port by default 8498')
    .describe('phantom-port-high', 'High bound of phantomjs server port by default 8598')
    .describe('phantom-exec-timeout', 'Max phantomjs execution time by default 6000')
    .describe('impress-timeout', 'Max impress execution time by default 12000')
    .describe('impress-notices', 'Add notices to impress report by default false')
    .describe('impress-warnings', 'Add warnings to impress report by default false')
    .help('h')
    .alias('h', 'help')
    .epilog('impress (https://github.com/icons8/impress)')
    .argv;

new Application(argv).run();
