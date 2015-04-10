const
  EXIT_ERROR_CODE = 1;

var
  Shell = require('./Shell'),
  webServer = require('webserver'),
  Page = require('./Page'),
  qs = require('../../node_modules/qs');

module.exports = Server;

function Server(options) {
  this.options = options || {};
  this.port = options.serverPort || 8498;
}

Server.prototype = {

  run: function() {
    this._create();
  },

  _create: function() {
    var
      server = webServer.create(),
      serverInstance,
      port = this.port,
      self = this;

    try {
      serverInstance = server.listen(port, function (req, res) {
        var
          query,
          url,
          page;

        query = qs.parse(req.url.split('?')[1]);
        url = query.url || query.uri || query.page;

        try {
          page = new Page(url, self.options);
          page.on('exit', function(content) {
            send(content);
            try {
              page.destroy();
            }
            catch(error) {
              Shell.exitWithError('Error: could not destroy page object', url, error);
            }
          });
          page.open();
        }
        catch(error) {
          Shell.exitWithError('Error: could not open page', url, error);
        }

        function send(result) {
          res.statusCode = 200;
          res.headers = {
            "Cache": 'no-cache',
            "Content-Type": 'text/html'
          };
          res.write(JSON.stringify(result));
          res.close();
        }
      });

      if (serverInstance) {
        Shell.log('Info: server running on port', port);
      } else {
        throw new Error('Server not created');
      }
    }
    catch(error) {
      Shell.exitWithError('Error: Could not create web server listening on port', port, error);
    }


  }

};
