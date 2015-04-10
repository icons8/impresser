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

  preInitInstances: function(count) {
    var
      instance,
      index,
      self = this;

    count = count || 1;

    process.nextTick(function() {
      for (index = 0; index < count; index++) {
        instance = new Instance(self.portPool, self.options);
        self.pool.push(instance);
        instance.init()
      }
    });
  },

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
