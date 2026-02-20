const { Worker } = require('bullmq');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { QdrantVectorStore } = require('@langchain/qdrant');
// const { Document } = require('@langchain/core/documents');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
// const { CharacterTextSplitter } = require('@langchain/textsplitters');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const worker = new Worker(
  'file-upload-queue',
  async (job) => {
    console.log(`Job:`, job.data);
    const data = typeof job.data === 'string' ? JSON.parse(job.data) : job.data;
    /*
    Path: data.path
    read the pdf from path,
    chunk the pdf,
    call the openai embedding model for every chunk,
    store the chunk in qdrant db
    */

    // Load the PDF
    const loader = new PDFLoader(data.path);
    const docs = await loader.load();
    console.log(`Docs:`, docs);

    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: 'http://localhost:6333',
        collectionName: 'langchainjs-testing',
      }
    );
    await vectorStore.addDocuments(docs);
    console.log(`All docs are added to vector store`);
  },
  {
    concurrency: 100,
    connection: {
      host: 'localhost',
      port: '6379',
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Worker completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Worker failed job ${job?.id}:`, err.message);
});
