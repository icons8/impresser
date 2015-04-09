#!/usr/bin/env node

'use strict';

var
  Server = require('../lib/Server'),
  yargs = require('yargs'),

  argv = yargs
    .usage('Usage: $0 [options]')
    .describe('base-url', 'Base url for proxy addresses by default http://icons8.com')
    .describe('frontend', 'Use impress as frontend server by default true')
    .describe('proxy', 'Use proxy server for resources and not GET requests by default true')
    .describe('server-port', 'Port of impress server by default 8497')
    .describe('max-parallel', 'Limit of parallel impress instances, by default 2 on each CPU cores')
    .describe('max-queue', 'Limit of impress queue, by default 30 * "Limit of parallel impress instances.')
    .describe('max-queue-timeout', 'Max timeout for deferring in queue by default 90000')
    .describe('phantom-binary', 'Path to phantomjs binary file by default %IMPRESS_DIR%/phantomjs/binary/phantomjs')
    .describe('phantom-exec-timeout', 'Max phantomjs execution time by default 20000')
    .describe('phantom-args', 'Add or reassign args for phantomjs command line by default "ignore-ssl-errors=true ssl-protocol=tlsv1"')
    .describe('phantom-script', 'Path to phantomjs script file by default %IMPRESS_DIR%/phantomjs/impress.js')
    .describe('phantom-max-content-length', 'Max page content length by default 2097152')
    .describe('impress-notices', 'Add notices to impress report by default false')
    .describe('impress-warnings', 'Add warnings to impress report by default false')
    .help('h')
    .alias('h', 'help')
    .epilog('impress (https://github.com/icons8/impress)')
    .argv;

new Server(argv).run();
