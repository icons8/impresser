
module.exports = merge;

function merge(base, object) {
  if (!object || typeof object != 'object') {
    return;
  }
  return _merge(base, object);

  function _merge(to, from) {
    if (!to || !from || typeof to != 'object' || typeof from != 'object' || Array.isArray(to) || Array.isArray(from)) {
      return from;
    }
    Object.keys(from).forEach(function(key) {
      if (to.hasOwnProperty(key)) {
        to[key] = _merge(to[key], from[key]);
      }
      else {
        to[key] = from[key];
      }
    });
    return to;
  }
}