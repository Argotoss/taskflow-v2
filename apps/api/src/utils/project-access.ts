import type { FastifyInstance } from 'fastify';

export const ensureProjectAccess = async (
  app: FastifyInstance,
  projectId: string,
  userId: string
): Promise<{ id: string; workspaceId: string; ownerId: string }> => {
  const project = await app.prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspaceId: true,
      ownerId: true
    }
  });

  if (!project) {
    throw app.httpErrors.notFound('Project not found');
  }

  const membership = await app.prisma.membership.findFirst({
    where: {
      workspaceId: project.workspaceId,
      userId
    }
  });

  if (!membership) {
    throw app.httpErrors.forbidden('Insufficient permissions for project');
  }

  return project;
};
