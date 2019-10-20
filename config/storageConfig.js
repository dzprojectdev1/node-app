const {Storage} = require('@google-cloud/storage');

const storage = new Storage({
  projectId: process.env.PROJECT_ID,
  keyFilename: 'creds.json',
});

const bucket = storage.bucket(process.env.BUCKET_NAME);

module.exports = {
  storage,
  bucket,
};