# Redis Usage in Event Spot

## Purpose

Redis is used as a **job queue broker** for chatbot file processing. It is not used as a database, cache, or session store in this project — its only job is to hand off "a file needs processing" tasks from the API to a background worker.

## Why we need it

When an admin uploads a document for the chatbot (`POST /api/chatbot/upload`), the file needs to be ingested — read, parsed, and chunked — before it can be used. This ingestion step can be slow.

Without a queue, the API would have to do this processing while the admin's HTTP request waits, which:
- Blocks the request for as long as processing takes
- Ties up server resources handling one upload at a time
- Risks timeouts on larger files

Redis solves this by acting as a lightweight, shared "to-do list" that the API writes to and a separate worker process reads from — decoupling the upload response from the actual processing work.

## How it works

### 1. Queue setup — [`utils/redisQueue.js`](utils/redisQueue.js)

- Connects to Redis using `REDIS_HOST` / `REDIS_PORT` env vars (defaults to `127.0.0.1:6379`).
- Uses [BullMQ](https://docs.bullmq.io/) to manage a queue named `file-upload-queue`.
- `isRedisReachable()` — opens a raw TCP socket to Redis with a short timeout (`REDIS_CONNECT_TIMEOUT_MS`, default 500ms) to check availability *before* trying to use it.
- `getChatbotQueue()` — lazily creates the BullMQ `Queue` instance only if Redis is reachable. If Redis is down, it returns `null` instead of throwing.

### 2. Producer (API) — [`index.js`](index.js)

On `POST /api/chatbot/upload` (admin-only route):

1. The uploaded file is stored in S3 first.
2. The API checks if the queue is available (`getChatbotQueue()`).
3. **If Redis is available:** the job details (`storageKey`, `filename`, `mimeType`, etc.) are pushed onto `file-upload-queue`. The API responds immediately with `processingMode: 'queue'` — actual processing happens later, asynchronously, in the worker.
4. **If Redis is unavailable:** the API falls back to processing the file **inline**, in the same request, and responds with `processingMode: 'inline'`. This is a graceful-degradation path — the feature still works even if Redis is down, just slower and synchronous.

### 3. Consumer (Worker) — [`worker.js`](worker.js)

- A separate, long-running process (started with `node worker.js`), independent from the API server.
- Connects to the same Redis instance and listens on `file-upload-queue` (concurrency: 100 jobs at once).
- For each job picked up, it calls `processChatbotFile()` to actually ingest the document (chunking, etc.).
- Unlike the API, the worker **requires** Redis — if Redis isn't reachable at startup, it logs an error and exits, since without a queue to read from, there's nothing for it to do.

## Summary table

| Component | Role | Redis dependency |
|---|---|---|
| `utils/redisQueue.js` | Connection + reachability check + queue factory | Owns the connection logic |
| `index.js` (API) | Producer — adds jobs to the queue on upload | Optional (falls back to inline processing) |
| `worker.js` | Consumer — processes jobs off the queue | Required (exits if unreachable) |

## Key takeaway

Redis here is purely a **task queue** (via BullMQ), decoupling "a file was uploaded" from "the file was processed," with a built-in fallback so the chatbot upload feature doesn't hard-fail if Redis happens to be down.
