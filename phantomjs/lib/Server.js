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
      serverInstance = server.listen(port, function (request, response) {
        var
          query,
          url,
          page;

        query = qs.parse(request.url.split('?')[1]);
        url = query.url || query.uri || query.page;

        try {
          page = new Page(url, self.options);
          page.on('exit', function(content) {
            send(content);
            Shell.log('Ok: page', url);
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
          response.statusCode = 200;
          response.headers = {
            'Cache': 'no-cache',
            'Content-Type': 'text/html'
          };
          response.write(JSON.stringify(result));
          response.close();
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
