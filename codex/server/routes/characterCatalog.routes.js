import { z } from 'zod';
import { requireAuth } from '../auth-pre-handler.js';
import { getCharacters, saveCharacter, deleteCharacter } from '../characterCatalog.persistence.js';

const characterCatalogSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  controls: z.record(z.string(), z.any()).optional().default({}),
  specJson: z.string().min(1),
  specHash: z.string().min(1),
});

export async function characterCatalogRoutes(fastify) {
  fastify.get('/api/character/catalog', {
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const userId = request.session.user.id;
      try {
        const characters = await getCharacters(userId);
        return reply.send({ success: true, characters });
      } catch (err) {
        request.log.error(err, 'Failed to fetch character catalog');
        return reply.status(500).send({ error: 'Failed to fetch characters' });
      }
    }
  });

  fastify.post('/api/character/catalog', {
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const userId = request.session.user.id;
      const parsed = characterCatalogSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
      }

      try {
        const character = await saveCharacter(userId, parsed.data);
        return reply.send({ success: true, character });
      } catch (err) {
        request.log.error(err, 'Failed to save character');
        return reply.status(500).send({ error: 'Failed to save character' });
      }
    }
  });

  fastify.delete('/api/character/catalog/:id', {
    preHandler: [requireAuth],
    handler: async (request, reply) => {
      const userId = request.session.user.id;
      const { id } = request.params;

      try {
        const success = await deleteCharacter(id, userId);
        if (!success) {
          return reply.status(404).send({ error: 'Character not found' });
        }
        return reply.send({ success: true });
      } catch (err) {
        request.log.error(err, 'Failed to delete character');
        return reply.status(500).send({ error: 'Failed to delete character' });
      }
    }
  });
}
