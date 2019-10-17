const path = require('path');
const express = require("express");
const uploadApi = express.Router();
const sharp = require('sharp');
const multer = require('multer');

const dbConn = require('../config/dbConfig');
const { deleteFiles } = require('../utils/fileSystem');

const TEMP_UPLOAD_FOLDER = '/tmp';
const DESIRED_FILE_EXTENSION = 'jpg';

const upload = multer({
  dest: TEMP_UPLOAD_FOLDER,
  // storage: multer.diskStorage({
  //   destination: function (req, file, cb) {
  //     cb(null, 'uploads/')
  //   },
  //   filename: function (req, file, cb) {
  //     cb(null, Date.now() + '.jpg') //Appending .jpg
  //   }
  // })
});

const checkAuth = require('../middleware/check_auth');
const { bucket, sideBucket } = require('../config/storageConfig');

/**
 * Based on old version of app where we were storing videos.
 * Need to transfer this data to an actual photo or upload table in the future.
 * @param {Object} options
 * @param {string} options.userId
 * @param {string} options.cdnId
 * @param {string} options.cdnFilteredId
 * @param {boolean} options.isPrimary
 */
function createNewVideoInDatabase({
  userId,
  cdnId,
  cdnFilteredId,
  // isPrimary = 1,
}) {
  

  return new Promise((resolve, reject) => {
    dbConn.query('SELECT * FROM tbl_video WHERE user_id=? AND is_primary=1', userId, function(error, results, fields) {
      if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
      var isPrimary = 1;
      if (results.length) {
        isPrimary = 0;
      }
      const videoData = {
        user_id: userId,
        cdn_id: cdnId,
        cdn_filtered_id: cdnFilteredId,
        created_date: new Date(),
        updated_date: new Date(),
        is_reply: 0,
        is_primary: isPrimary,
        publish: 1,
        match_id: null
      };
      dbConn.query('INSERT INTO tbl_video SET ? ', videoData, (err, results) => {
        if (err) reject(err);
        resolve(results);
      });
    });    
  })
}

uploadApi.post('/userPhoto', checkAuth, upload.single('fileData'), (req, res) => {
  const file = req.file;
  const originalFilePath = path.join(TEMP_UPLOAD_FOLDER, file.filename);
  const processedFilePath = path.join(TEMP_UPLOAD_FOLDER, `${file.filename}.${DESIRED_FILE_EXTENSION}`);

  sharp(file.path)
    .jpeg()
    .toFile(processedFilePath)
    .then(() => {
      const photoIdInBucket = `${file.filename}-screenshot`;

      return sideBucket.upload(processedFilePath, {
        destination: photoIdInBucket,
      })
        .then(storageResponse => {
          return createNewVideoInDatabase({
            userId: req.userData.userId,
            cdnId: file.filename,
            cdnFilteredId: file.filename,
          })
            .then(videoRecord => {
              res.send(videoRecord);

              deleteFiles([
                originalFilePath,
                processedFilePath,
              ]);
            });
        })
    })
    .catch(err => {
      deleteFiles([
        originalFilePath,
        processedFilePath,
      ]);

      res.status(500).send(err);
    });
});

module.exports = uploadApi;