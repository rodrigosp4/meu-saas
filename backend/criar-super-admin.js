/**
 * Script para criar o usuário SUPER_ADMIN.
 * Execute UMA VEZ após parar o servidor e rodar `npx prisma generate`:
 *
 *   node backend/criar-super-admin.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL    = process.env.ADMIN_EMAIL    || 'admin@meusaas.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Troque@senha123';

async function main() {
  const exists = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (exists) {
    if (exists.role === 'SUPER_ADMIN') {
      console.log(`✓ Super Admin já existe: ${EMAIL}`);
      return;
    }
    // Promover usuário existente
    await prisma.user.update({ where: { email: EMAIL }, data: { role: 'SUPER_ADMIN' } });
    console.log(`✓ Usuário ${EMAIL} promovido a SUPER_ADMIN.`);
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.create({
    data: { email: EMAIL, senha: hash, role: 'SUPER_ADMIN', ativo: true },
  });
  console.log(`✓ Super Admin criado:`);
  console.log(`  E-mail: ${EMAIL}`);
  console.log(`  Senha:  ${PASSWORD}`);
  console.log(`\n  ⚠  Troque a senha imediatamente após o primeiro login.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
