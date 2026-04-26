const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { s3 } = require('./s3Client');

const CHATBOT_UPLOADS_PREFIX = String(process.env.CHATBOT_UPLOADS_PREFIX || 'chatbot-uploads')
  .replace(/^\/+/, '')
  .replace(/\/+$/, '');

const buildPrefix = () => (CHATBOT_UPLOADS_PREFIX ? `${CHATBOT_UPLOADS_PREFIX}/` : '');

const ensureBucket = () => {
  if (!process.env.AWS_BUCKET_NAME) {
    throw new Error('AWS_BUCKET_NAME is not configured');
  }
};

const sanitizeFileName = (name, fallback = 'document.pdf') => path.basename(name || fallback);

const buildStorageKey = (fileName) => `${buildPrefix()}${fileName}`;

const buildStoredFileName = (originalName) => `${Date.now()}_${sanitizeFileName(originalName)}`;

const getOriginalNameFromStoredFileName = (storedFileName) => {
  const splitIndex = storedFileName.indexOf('_');
  return splitIndex !== -1 ? storedFileName.slice(splitIndex + 1) : storedFileName;
};

const getMimeTypeFromFileName = (fileName) => {
  if (fileName.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (fileName.toLowerCase().endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
};

const assertSafeStoredFileName = (fileName) => {
  const safeName = sanitizeFileName(fileName, '');
  if (!safeName || safeName !== fileName) {
    throw new Error('Invalid uploaded filename');
  }
  return safeName;
};

const getObjectBuffer = async (storageKey) => {
  ensureBucket();

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: storageKey,
    })
  );

  if (!response.Body) {
    throw new Error('Uploaded file body is empty');
  }

  const bytes = await response.Body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType || getMimeTypeFromFileName(storageKey),
    contentLength: response.ContentLength || bytes.length,
  };
};

const uploadChatbotFileToS3 = async (file) => {
  ensureBucket();

  if (!file?.buffer) {
    throw new Error('Uploaded chatbot file buffer is missing');
  }

  const originalName = sanitizeFileName(file.originalname);
  const fileName = buildStoredFileName(originalName);
  const storageKey = buildStorageKey(fileName);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: storageKey,
      Body: file.buffer,
      ContentType: file.mimetype || getMimeTypeFromFileName(originalName),
      Metadata: {
        originalname: encodeURIComponent(originalName),
      },
    })
  );

  return {
    storageKey,
    filename: fileName,
    originalName,
    size: file.size || file.buffer.length,
    mimeType: file.mimetype || getMimeTypeFromFileName(originalName),
    uploadedAt: new Date().toISOString(),
  };
};

const listChatbotFilesFromS3 = async () => {
  ensureBucket();

  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: process.env.AWS_BUCKET_NAME,
      Prefix: buildPrefix(),
    })
  );

  const files = (response.Contents || [])
    .filter((item) => item.Key)
    .map((item) => {
      const fileName = sanitizeFileName(item.Key);
      return {
        filename: fileName,
        originalName: getOriginalNameFromStoredFileName(fileName),
        size: item.Size || 0,
        uploadedAt: item.LastModified ? item.LastModified.toISOString() : null,
      };
    })
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

  return files;
};

const getChatbotFileFromS3 = async (fileName) => {
  const safeName = assertSafeStoredFileName(fileName);
  const storageKey = buildStorageKey(safeName);
  const object = await getObjectBuffer(storageKey);

  return {
    ...object,
    filename: safeName,
    originalName: getOriginalNameFromStoredFileName(safeName),
  };
};

const deleteChatbotFileFromS3 = async (fileName) => {
  ensureBucket();

  const safeName = assertSafeStoredFileName(fileName);

  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: buildStorageKey(safeName),
    })
  );

  return {
    filename: safeName,
    originalName: getOriginalNameFromStoredFileName(safeName),
  };
};

const downloadChatbotFileToTemp = async ({ storageKey, originalName, filename }) => {
  if (!storageKey) {
    throw new Error('Chatbot storage key is required');
  }

  const { buffer } = await getObjectBuffer(storageKey);
  const referenceName = sanitizeFileName(originalName || filename || storageKey);
  const extension = path.extname(referenceName) || '.pdf';
  const tempFilePath = path.join(
    os.tmpdir(),
    `eventspot-chatbot-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`
  );

  await fs.writeFile(tempFilePath, buffer);

  return {
    tempFilePath,
    cleanup: async () => {
      await fs.unlink(tempFilePath).catch(() => {});
    },
  };
};

module.exports = {
  CHATBOT_UPLOADS_PREFIX,
  deleteChatbotFileFromS3,
  downloadChatbotFileToTemp,
  getChatbotFileFromS3,
  listChatbotFilesFromS3,
  uploadChatbotFileToS3,
};
