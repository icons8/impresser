
module.exports = PageNotFoundError;

function PageNotFoundError() {
  this.name = 'PageNotFoundError';
  this.message = 'Not Found';
}

PageNotFoundError.prototype = Object.create(Error.prototype);
