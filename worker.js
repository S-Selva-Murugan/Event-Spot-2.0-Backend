const { Worker } = require('bullmq');
const path = require('path');
const { processChatbotFile } = require('./utils/chatbotIngestion');
const {
  CHATBOT_QUEUE_NAME,
  REDIS_HOST,
  REDIS_PORT,
  getRedisConnection,
  isRedisReachable,
} = require('./utils/redisQueue');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const startWorker = async () => {
  const reachable = await isRedisReachable();

  if (!reachable) {
    console.error(
      `Redis is not reachable at ${REDIS_HOST}:${REDIS_PORT}. Start Redis/Valkey before running the worker.`
    );
    process.exit(1);
  }

  const worker = new Worker(
    CHATBOT_QUEUE_NAME,
    async (job) => {
      console.log('Job:', job.data);
      const result = await processChatbotFile(job.data);
      console.log(`Processed ${result.documentsProcessed} document chunk(s)`);
    },
    {
      concurrency: 100,
      connection: getRedisConnection(),
    }
  );

  worker.on('completed', (job) => {
    console.log(`Worker completed job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Worker failed job ${job?.id}:`, err.message);
  });
};

startWorker().catch((error) => {
  console.error('Worker startup failed:', error.message);
  process.exit(1);
});
