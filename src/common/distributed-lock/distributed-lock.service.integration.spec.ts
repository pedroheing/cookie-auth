import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { flushRedis } from 'test/helpers/flush-redis';
import { RedisService } from '../internal/redis/redis.service';
import { DistributedLockModule } from './distributed-lock.module';
import { DistributedLockService } from './distributed-lock.service';

describe('DistributedLockService', () => {
	let app: INestApplication;
	let distributedLockService: DistributedLockService;
	let redisService: RedisService;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [DistributedLockModule],
		}).compile();
		app = moduleRef.createNestApplication();
		await app.init();
		distributedLockService = moduleRef.get(DistributedLockService);
		redisService = moduleRef.get(RedisService);
	});

	afterAll(async () => {
		await app.close();
	});

	afterEach(async () => {
		jest.useRealTimers();
		await flushRedis();
	});

	describe('acquire', () => {
		it('should acquire the lock', async () => {
			const key = 'key';

			const lock = await distributedLockService.acquire(key);

			try {
				expect(lock).toBeDefined();
				expect(lock.key).toBe(key);
			} finally {
				await lock.release();
			}
		});

		it('should set the correct TTL directly in the Redis server', async () => {
			const key = 'resource_key';
			const expirationTime = 10;

			const lock = await distributedLockService.acquire(key, {
				expirationTimeInSeconds: expirationTime,
			});

			try {
				const actualTtl = await redisService.ttl(key);
				expect(actualTtl).toBeGreaterThan(0);
				expect(actualTtl).toBeLessThanOrEqual(expirationTime);
			} finally {
				await lock.release();
			}
		});

		it('should continuously renew the Redis TTL via heartbeat', async () => {
			jest.useFakeTimers();
			const key = 'heartbeat_key';
			const expirationTime = 10;

			const lock = await distributedLockService.acquire(key, {
				expirationTimeInSeconds: expirationTime,
			});

			try {
				await jest.advanceTimersByTimeAsync(8000);
				const ttlAfterHeartbeat = await redisService.ttl(key);
				expect(ttlAfterHeartbeat).toBeGreaterThan(5);
			} finally {
				await lock.release();
			}
		});

		it('should acquire the lock after retrying when the lock was in use and then was released', async () => {
			const key = 'key';
			await redisService.set(key, 'value');
			const releaseTimeout = 400;
			const acquireTimeout = 1500;
			setTimeout(() => {
				void redisService.del(key);
			}, releaseTimeout);
			const startTime = Date.now();

			const lock = await distributedLockService.acquire(key, {
				timeout: acquireTimeout,
			});

			try {
				expect(lock).toBeDefined();
				const duration = Date.now() - startTime;
				expect(duration).toBeGreaterThanOrEqual(releaseTimeout);
				expect(duration).toBeLessThan(acquireTimeout);
			} finally {
				await lock.release();
			}
		});

		it('should throw an error when it times out', async () => {
			const key = 'key';
			await redisService.set(key, 'value');
			const acquireTimeout = 100;

			await expect(
				distributedLockService.acquire(key, {
					timeout: acquireTimeout,
				}),
			).rejects.toThrow(Error);
		});
	});

	describe('release', () => {
		it('should remove the key from Redis', async () => {
			const key = 'release_key';
			const lock = await distributedLockService.acquire(key);

			await lock.release();

			const result = await redisService.exists(key);
			expect(result).toBe(0);
		});

		it('should allow acquiring the lock again after release', async () => {
			const key = 'release_reacquire_key';
			const lock = await distributedLockService.acquire(key);
			await lock.release();

			const newLock = await distributedLockService.acquire(key);

			try {
				expect(newLock).toBeDefined();
			} finally {
				await newLock.release();
			}
		});
	});
});
