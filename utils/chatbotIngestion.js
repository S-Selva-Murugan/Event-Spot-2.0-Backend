const fs = require('fs/promises');
const path = require('path');
const { Document } = require('@langchain/core/documents');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { createQdrantVectorStore, isQdrantReachable, QDRANT_URL } = require('./qdrant');

const loadDocuments = async (filePath) => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.pdf') {
    const loader = new PDFLoader(filePath);
    return loader.load();
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

const processChatbotFile = async ({ path: filePath }) => {
  if (!filePath) {
    throw new Error('File path is required for chatbot ingestion');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing in backend environment');
  }

  const qdrantReachable = await isQdrantReachable();
  if (!qdrantReachable) {
    throw new Error(`Qdrant is not reachable at ${QDRANT_URL}. Start Qdrant before processing chatbot files.`);
  }

  const docs = await loadDocuments(filePath);

  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY,
  });

  const vectorStore = createQdrantVectorStore(embeddings);

  await vectorStore.ensureCollection();

  await vectorStore.addDocuments(docs);

  return { documentsProcessed: docs.length };
};

module.exports = {
  processChatbotFile,
};
