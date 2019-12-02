const fs = require('fs');

function deleteFiles(files) {
  const promises = files
    .map(file => {
      return new Promise((resolve, reject) => {
        fs.unlink(file, err => {
          if (err) {
            console.warn(`error deleting files: ${files}, error message: ${err.message}`);
            resolve();
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