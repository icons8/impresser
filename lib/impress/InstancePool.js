var
  Instance = require('./Instance'),
  InstancePortPool = require('./InstancePortPool')
  ;

module.exports = InstancePool;

function InstancePool(options) {
  this.options = options || {};
  this.pool = [];
  this.portPool = new InstancePortPool(options);
}

InstancePool.prototype = {

  getInstance: function() {
    var
      index,
      instance;
    for (index = 0; index < this.pool.length; index++) {
      instance = this.pool[index];
      if (!instance || instance.destroyed) {
        this.pool.splice(index --, 1);
      }
      else if (!instance.pending) {
        return instance;
      }
    }
    instance = new Instance(this.portPool, this.options);
    this.pool.push(instance);
    return instance;
  }

};
