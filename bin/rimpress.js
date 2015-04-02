#!/usr/bin/env node

'use strict';

var
  Server = require('../lib/Server'),
  yargs = require('yargs'),

  argv = yargs
    .usage('Usage: $0 [options]')
    .describe('pool-max-size', 'Limit of parallel impress instances, by default 4 on each CPU cores')
    .describe('queue-max-size', 'Limit of impress queue, by default 10 * "Limit of parallel impress instances.')
    .describe('max-deferred-timeout', 'Max timeout for deferring in queue by default 60000')
    .describe('impress-binary', 'Path to impress binary file (phantomjs executable file) by default %RIMPRESS_DIR%/phantomjs/binary/phantomjs')
    .describe('impress-path', 'Path to impress script file by default %RIMPRESS_DIR%/phantomjs/impress.js')
    .describe('impress-timeout', 'Max impress execution time by default 10000')
    .describe('impress-max-content-length', 'Max impress content length by default 1024*1024')
    .describe('impress-args', 'Add or reassign args for impress (phantomjs) command line by default "load-images=false ignore-ssl-errors=true ssl-protocol=tlsv1"')
    .help('h')
    .alias('h', 'help')
    .epilog('rimpress (https://github.com/icons8/rimpress)')
    .argv;

new Server().run(argv);
