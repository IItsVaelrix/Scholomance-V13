import { downloaderService } from '../services/downloader.service.js';

export default async function downloaderRoutes(fastify, options) {
  // Preflight URL
  fastify.post('/preflight', async (request, reply) => {
    const { url } = request.body;
    try {
      const info = await downloaderService.preflight(url);
      return reply.send({ ok: true, info });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  // Create & Start Job
  fastify.post('/jobs', async (request, reply) => {
    const { url, profile, format, mode } = request.body;
    try {
      // Basic URL validation happens in createJob/preflight implicitly
      const job = await downloaderService.createJob(url, { profile, format });

      // Start in background
      downloaderService.startJob(job.id, { mode }).catch(err => {
        fastify.log.error({ err, jobId: job.id }, 'Background download job failed to start');
      });

      return reply.send({ ok: true, job });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  // Get Job
  fastify.get('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    const job = await downloaderService.getJob(jobId);
    if (!job) {
      return reply.code(404).send({ ok: false, error: 'Job not found' });
    }
    return reply.send({ ok: true, job });
  });

  // Get History
  fastify.get('/history', async (request, reply) => {
    const jobs = await downloaderService.getAllJobs();
    return reply.send({ ok: true, jobs });
  });

  // Cancel Job
  fastify.post('/jobs/:jobId/cancel', async (request, reply) => {
    const { jobId } = request.params;
    try {
      await downloaderService.cancelJob(jobId);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  // SSE Events for Job
  fastify.get('/jobs/:jobId/events', async (request, reply) => {
    const { jobId } = request.params;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    // Send history
    const pastEvents = await downloaderService.getEvents(jobId);
    for (const ev of pastEvents) {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    }

    const onJobEvent = (data) => {
      if (data.jobId === jobId) {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    const onJobUpdated = (data) => {
      if (data.id === jobId) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'status_update', job: data })}\n\n`);
      }
    };

    downloaderService.on('job_event', onJobEvent);
    downloaderService.on('job_updated', onJobUpdated);

    request.raw.on('close', () => {
      downloaderService.removeListener('job_event', onJobEvent);
      downloaderService.removeListener('job_updated', onJobUpdated);
    });
  });
}
