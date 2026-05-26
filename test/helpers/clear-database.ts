import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

export function getPrisma() {
	if (!prisma) {
		prisma = new PrismaClient();
	}
	return prisma;
}

export async function clearDatabase() {
	const db = getPrisma();

	const tables = await db.$queryRaw<Array<{ tablename: string }>>`
		SELECT tablename FROM pg_tables
		WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
	`;

	for (const { tablename } of tables) {
		await db.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
	}
}
