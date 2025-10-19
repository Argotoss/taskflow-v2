import { prisma } from '@taskflow/db';
import { hashPassword } from '../modules/auth/hash.js';

const adminEmail = 'admin@gmail.com';
const adminPassword = 'password';

export const ensureAdminUser = async (): Promise<void> => {
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(adminPassword);
  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      name: 'Taskflow Admin',
      notificationPreference: {
        create: {}
      }
    }
  });
};
