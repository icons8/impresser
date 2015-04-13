var
  fs = require('fs');

module.exports = readJsonFile;

function readJsonFile(filePath) {
  var
    stream,
    data = '';
  try {
    stream = fs.open(filePath, 'r');
    while(!stream.atEnd()) {
      data += stream.readLine();
    }
    return JSON.parse(data);
  }
  catch(e) {
    throw new Error('Could not read file "' + filePath + '". Expected error: ' + String(e));
  }
}
