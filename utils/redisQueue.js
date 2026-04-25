const net = require('net');
const { Queue } = require('bullmq');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 500);
const CHATBOT_QUEUE_NAME = 'file-upload-queue';

let queueInstance = null;
let queuePromise = null;
let redisWarningShown = false;

const getRedisConnection = () => ({
  host: REDIS_HOST,
  port: REDIS_PORT,
});

const isRedisReachable = () =>
  new Promise((resolve) => {
    const socket = net.createConnection({
      host: REDIS_HOST,
      port: REDIS_PORT,
    });

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(REDIS_CONNECT_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });

const getChatbotQueue = async () => {
  if (queueInstance) {
    return queueInstance;
  }

  if (!queuePromise) {
    queuePromise = (async () => {
      const reachable = await isRedisReachable();

      if (!reachable) {
        if (!redisWarningShown) {
          console.warn(
            `Redis is not reachable at ${REDIS_HOST}:${REDIS_PORT}. Chatbot uploads will be processed inline.`
          );
          redisWarningShown = true;
        }
        return null;
      }

      const queue = new Queue(CHATBOT_QUEUE_NAME, {
        connection: getRedisConnection(),
      });

      queue.on('error', (error) => {
        console.error('Chatbot queue error:', error.message);
      });

      queueInstance = queue;
      return queueInstance;
    })().finally(() => {
      queuePromise = null;
    });
  }

  return queuePromise;
};

module.exports = {
  CHATBOT_QUEUE_NAME,
  REDIS_HOST,
  REDIS_PORT,
  getChatbotQueue,
  getRedisConnection,
  isRedisReachable,
};
