var
  ImpressInstance = require('./ImpressInstance')
  ;


module.exports = ImpressInstancePool;

function ImpressInstancePool(options) {
  this.options = options || {};

}

ImpressInstancePool.prototype = {

  getInstance: function(deferred) {
    return new ImpressInstance(deferred, this.options)
  },

  releaseInstance: function(instance) {
    instance.destroy();
  }

};
