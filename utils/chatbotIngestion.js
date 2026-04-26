const fs = require('fs/promises');
const path = require('path');
const { Document } = require('@langchain/core/documents');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { downloadChatbotFileToTemp } = require('./chatbotStorage');
const { createQdrantVectorStore, isQdrantReachable, QDRANT_URL } = require('./qdrant');

const loadDocuments = async (filePath, sourceLabel) => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.pdf') {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    return docs.map(
      (doc) =>
        new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            source: sourceLabel,
          },
        })
    );
  }

  if (extension === '.txt') {
    const content = await fs.readFile(filePath, 'utf8');
    return [
      new Document({
        pageContent: content,
        metadata: { source: filePath },
      }),
    ];
  }

  throw new Error(`Unsupported file type: ${extension || 'unknown'}`);
};

const resolveChatbotFileSource = async ({ path: filePath, storageKey, originalName, filename }) => {
  if (filePath) {
    return {
      filePath,
      sourceLabel: originalName || filename || path.basename(filePath),
      cleanup: async () => {},
    };
  }

  const tempFile = await downloadChatbotFileToTemp({ storageKey, originalName, filename });

  return {
    filePath: tempFile.tempFilePath,
    sourceLabel: originalName || filename || storageKey,
    cleanup: tempFile.cleanup,
  };
};

const processChatbotFile = async (fileSource) => {
  const {
    path: filePath,
    storageKey,
    originalName,
    filename,
  } = fileSource || {};

  if (!filePath && !storageKey) {
    throw new Error('File source is required for chatbot ingestion');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing in backend environment');
  }

  const qdrantReachable = await isQdrantReachable();
  if (!qdrantReachable) {
    throw new Error(`Qdrant is not reachable at ${QDRANT_URL}. Start Qdrant before processing chatbot files.`);
  }

  const source = await resolveChatbotFileSource({
    path: filePath,
    storageKey,
    originalName,
    filename,
  });
  try {
    const docs = await loadDocuments(source.filePath, source.sourceLabel);

    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    });

    const vectorStore = createQdrantVectorStore(embeddings);

    await vectorStore.ensureCollection();

    await vectorStore.addDocuments(docs);

    return { documentsProcessed: docs.length };
  } finally {
    await source.cleanup();
  }
};

module.exports = {
  processChatbotFile,
};
