const fs = require('fs');
const path = require('path');
const express = require("express");
const uploadApi = express.Router();
const sharp = require('sharp');
const multer = require('multer');

const dbConn = require('../config/dbConfig');
const { deleteFiles } = require('../utils/fileSystem');

const TEMP_UPLOAD_FOLDER = '/tmp';
const DESIRED_FILE_EXTENSION = 'jpg';
const THUMBNAIL_SIZES = [64, 128, 512];

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
const { bucket } = require('../config/storageConfig');

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
  cdnId_128,
  cdnId_64,
  // isPrimary = 1,
}) {
  return new Promise((resolve, reject) => {
    dbConn.query('SELECT * FROM tbl_video WHERE user_id=? AND is_primary=1', userId, function(error, results, fields) {
      // if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
      if (error) reject(error);
      var isPrimary = 1;
      if (results && results.length) {
        isPrimary = 0;
      }
      const videoData = {
        user_id: userId,
        cdn_id: cdnId,
        cdn_filtered_id: cdnFilteredId,
        cdn_id_128: cdnId_128,
        cdn_id_64: cdnId_64,
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

/**
 * 
 * @param {string} file
 * @param {string} toPath
 */
function resizeFile(fromPath, toPath, size) {
  if (size === 512) {
    return sharp(fromPath)
      .jpeg()
      .toFile(toPath);
  } else {
    return sharp(fromPath)
      .jpeg()
      .resize(size, size)
      .toFile(toPath);
  }
}

uploadApi.post('/userPhoto', checkAuth, upload.single('fileData'), (req, res) => {
  const file = req.file;
  const originalFilePath = path.join(TEMP_UPLOAD_FOLDER, file.filename);

  const promises = THUMBNAIL_SIZES
    .map(size => {
      const thumbnailName = size === 512 ? `${file.filename}.${DESIRED_FILE_EXTENSION}` : `thumb_${size}_${file.filename}.${DESIRED_FILE_EXTENSION}`;
      const processedFilePath = path.join(TEMP_UPLOAD_FOLDER, thumbnailName);
      const photoIdInBucket = size === 512 ? `${file.filename}-screenshot` : `thumb_${size}_${file.filename}-screenshot`;

      const uploadOptions = {
        destination: photoIdInBucket,
        metadata: {
          /**
           * Enable long-lived HTTP caching headers
           * Use only if the contents of the file will never change
           * (If the contents will change, use cacheControl: 'no-cache')
           */
          cacheControl: 'public, max-age=4133869200',
        },
      };

      return resizeFile(file.path, processedFilePath, size)
        .then(() => bucket.upload(processedFilePath, uploadOptions))
        .then(() => bucket.file(photoIdInBucket).makePublic())
        .then(() => deleteFiles([processedFilePath]))
        .catch(err => {
          console.error('something failed in resizeFile promise chain:', err.message);
          deleteFiles([processedFilePath]);
          throw err;
        });
    });
  
  Promise.all(promises)
    .then(storageResponse => {
      createNewVideoInDatabase({
        userId: req.userData.userId,
        cdnId: file.filename,
        cdnFilteredId: file.filename,
        cdnId_128: 'thumb_128_' + file.filename,
        cdnId_64: 'thumb_64_' + file.filename,
      })
        .then(videoRecord => {
          res.send(videoRecord);
        })
        .catch(err => {
          res.status(500).send(err);
        });
      
      deleteFiles([originalFilePath])
        .then(() => {
          fs.readdir(TEMP_UPLOAD_FOLDER, (err, res) => {
            console.log(`${TEMP_UPLOAD_FOLDER} contents: ${res}`);
          });
        });
    })
    .catch(e => {
      deleteFiles([originalFilePath])
        .then(() => {
          fs.readdir(TEMP_UPLOAD_FOLDER, (err, res) => {
            console.log(`${TEMP_UPLOAD_FOLDER} contents: ${res}`);
          });
        });

      res.status(500).send(e);
    });
});

uploadApi.post('/insertVideo', checkAuth, (req, res) => {  
  var userId = req.userData.userId;
  var cdn_id = req.body.cdn_id;

  console.log('userId ', userId);
  console.log('cdn_id ', cdn_id);

  var query = 'select * from tbl_user where id = ?';
  dbConn.query(query, [userId], function(error, results, fields) {
      if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
      if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

      dbConn.query('select * from tbl_video where user_id = ? and is_primary = 1', userId, function(error, primaryResults, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) {
          var insertData = {
            user_id: userId,
            cdn_id: cdn_id,
            cdn_filtered_id: cdn_id,
            is_primary: 1,
            content_type: 2,
            publish: 1,
            created_date: new Date(),
            updated_date: new Date()
          }          
        } else {
          var insertData = {
            user_id: userId,
            cdn_id: cdn_id,
            cdn_filtered_id: cdn_id,
            is_primary: 0,
            content_type: 2,
            publish: 1,
            created_date: new Date(),
            updated_date: new Date()
          }
        }

        console.log('insertData ', insertData);

        dbConn.query('insert into tbl_video set ?', insertData, function(error, insertResult, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            return res.send({ error: false, message: "Inserted Successfully." });
        });
      })
  });
});

module.exports = uploadApi;