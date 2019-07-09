const express = require("express");
const storageApi = express.Router();
const dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');
const {Storage} = require('@google-cloud/storage');

const storage = new Storage({
  projectId: 'dazzled-date-246123',
  keyFilename: 'creds.json',
});
const bucket = storage.bucket('fireblast-begonia-maxwell-dev');

storageApi.get('/videoLink', checkAuth, (req, res) => {
  const fileId = req.query.fileId;

  // TODO: SQL query to see if user has right to view video here

  bucket.getFiles(function(err, files) {
    if (err) {
      res.status(500).send('Storage API could not get files.');
    } else {
      const match = files.find(file => file.id === fileId);

      if (match) {
        match.getSignedUrl({
          action: 'read',
          expires: '03-17-2025'
        }, (err, url) => {
          if (err) {
            res.status(500).send('Storage API could not get signed URL.');
          } else {
            res.send(url);
          }
        });
      } else {
        res.status(400).send('Video not found.');
      }
    }
  });
});

module.exports = storageApi;