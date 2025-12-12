const aws = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");

const s3 = new aws.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    acl: "public-read",
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      // Use event name or ID for folder
      const eventFolder = req.body.eventName
        ? req.body.eventName.replace(/\s+/g, "_")
        : "event";

      const fileName = `${eventFolder}/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
  }),
  limits: { files: 3 }, // max 3 images per event
});

module.exports = upload;
