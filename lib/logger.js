var
  logger;

logger = getConsoleWriteDelegate('log');

['debug', 'log', 'info', 'warn', 'error'].forEach(function(type) {
  logger[type] = getConsoleWriteDelegate(type);
});

module.exports = logger;

function getConsoleWriteDelegate(type) {
  return function() {
    var
      args,
      date;

    args = Array.prototype.slice.call(arguments);
    date = new Date();
    args.unshift(
      [
        date.getUTCFullYear(),
        ('0' + (date.getUTCMonth()+1)).slice(-2),
        ('0' + date.getUTCDate()).slice(-2),
        '-',
        ('0' + date.getUTCHours()).slice(-2),
        ':',
        ('0' + date.getUTCMinutes()).slice(-2),
        ':',
        ('0' + date.getUTCSeconds()).slice(-2)
      ]
        .join('')
    );
    console[type].apply(console, args);
  }
}



