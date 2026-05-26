import Redis from 'ioredis';

export async function flushRedis() {
	const client = new Redis({
		host: process.env.REDIS_HOST,
		port: Number(process.env.REDIS_PORT),
		lazyConnect: true,
	});
	await client.connect();
	await client.flushdb();
	await client.quit();
}
