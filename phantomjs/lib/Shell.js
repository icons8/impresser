const
  OK_EXIT_CODE = 0,
  ERROR_EXIT_CODE = 1;

module.exports = Shell;

function Shell() {
}

Shell.ExitCode = {
  OK: OK_EXIT_CODE,
  ERROR: ERROR_EXIT_CODE
};

Shell.exit = function(code) {
  code = code || OK_EXIT_CODE;
  phantom.exit(code);
};

Shell.exitWithError = function(/* ...errors */) {
  var
    args = Array.prototype.slice.call(arguments);
  if (args.length > 0) {
    console.log.apply(console, args);
  }
  Shell.exit(Shell.ExitCode.ERROR);
};

Shell.log = function(/* ...value */) {
  console.log.apply(console, arguments);
};

Shell.output = function(buffer) {
  console.log(buffer);
};
