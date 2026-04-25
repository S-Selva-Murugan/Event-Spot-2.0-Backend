const net = require('net');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { QdrantVectorStore } = require('@langchain/qdrant');

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'langchainjs-testing';
const QDRANT_CONNECT_TIMEOUT_MS = Number(process.env.QDRANT_CONNECT_TIMEOUT_MS || 500);

const getQdrantEndpoint = () => {
  const parsed = new URL(QDRANT_URL);
  const isHttps = parsed.protocol === 'https:';

  return {
    host: parsed.hostname,
    port: Number(parsed.port || (isHttps ? 443 : 80)),
  };
};

const isQdrantReachable = () =>
  new Promise((resolve) => {
    const socket = net.createConnection(getQdrantEndpoint());

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(QDRANT_CONNECT_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });

const createQdrantClient = () =>
  new QdrantClient({
    url: QDRANT_URL,
    checkCompatibility: false,
  });

const createQdrantVectorStore = (embeddings) =>
  new QdrantVectorStore(embeddings, {
    client: createQdrantClient(),
    collectionName: QDRANT_COLLECTION,
  });

const getQdrantRetriever = async (embeddings, options = { k: 2 }) => {
  const vectorStore = createQdrantVectorStore(embeddings);
  await vectorStore.ensureCollection();
  return vectorStore.asRetriever(options);
};

module.exports = {
  QDRANT_URL,
  createQdrantClient,
  createQdrantVectorStore,
  getQdrantEndpoint,
  getQdrantRetriever,
  isQdrantReachable,
};
