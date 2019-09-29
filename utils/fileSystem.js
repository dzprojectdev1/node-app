const fs = require('fs');

function deleteFiles(files) {
  const promises = files
    .map(file => {
      return new Promise((resolve, reject) => {
        fs.unlink(file, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

  return Promise.all(promises);
}

module.exports = {
  deleteFiles,
};