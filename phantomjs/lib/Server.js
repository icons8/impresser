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
          blockedResources,
          page,
          pageOptions = {};

        pageOptions.__proto__ = self.options;

        query = qs.parse(req.url.split('?')[1]);
        url = query.url;

        if (typeof query['blocked-resources'] != 'undefined') {
          blockedResources = query['blocked-resources'];
          if (!Array.isArray(blockedResources)) {
            blockedResources = [];
          }
          blockedResources = blockedResources.filter(function(resource) {
            return resource;
          });

          pageOptions.blockedResources = blockedResources;
        }
        pageOptions.url = url;

        try {
          page = new Page(pageOptions);

          page.on('exit', function(content) {
            send(content);
            setTimeout(function() {
              try {
                page.destroy();
              }
              catch(error) {
                Shell.exitWithError('Error: could not destroy page object', url, error);
              }
            });
          });
          page.open();
        }
        catch(error) {
          send(500);
          setTimeout(function() {
            Shell.exitWithError('Error: could not open page', url, error);
          });
        }

        function send(code, result) {
          if (typeof code != 'number') {
            result = code;
            code = 200;
          }
          res.statusCode = code;
          res.headers = {
            "Cache": 'no-cache',
            "Content-Type": 'text/html'
          };
          if (result) {
            res.write(JSON.stringify(result));
          }
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
