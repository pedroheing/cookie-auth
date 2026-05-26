import { Config } from '@jest/types';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { execSync } from 'child_process';

export default async (globalConfig: Config.GlobalConfig) => {
	const testPathPattern = globalConfig.testPathPattern?.toString() ?? '';
	const isIntegrationRun = !testPathPattern || /integration/.test(testPathPattern);

	if (!isIntegrationRun) {
		console.log('\n[Global Setup] Skipping containers (no integration tests)');
		return;
	}

	console.log('\n[Global Setup] Starting containers...');

	const [postgres, redis] = await Promise.all([
		new PostgreSqlContainer('postgres:17').withDatabase('test_db').withUsername('test').withPassword('test').start(),
		new RedisContainer('redis:8').start(),
	]);

	process.env.DATABASE_URL = postgres.getConnectionUri();
	process.env.REDIS_HOST = redis.getHost();
	process.env.REDIS_PORT = String(redis.getPort());
	process.env.NODE_ENV = 'development';

	(global as any).__PG_CONTAINER__ = postgres;
	(global as any).__REDIS_CONTAINER__ = redis;

	console.log('[Global Setup] Running migrations...');
	execSync('npx prisma migrate deploy', {
		env: { ...process.env },
		stdio: 'inherit',
	});

	console.log('[Global Setup] Done!');
};
