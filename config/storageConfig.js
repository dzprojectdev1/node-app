const {Storage} = require('@google-cloud/storage');

const storage = new Storage({
  projectId: process.env.PROJECT_ID,
  keyFilename: process.env.SERVICE_ACCOUNT_CRED_FILE,
});

const bucket = storage.bucket(process.env.BUCKET_NAME);

module.exports = {
  storage,
  bucket,
};