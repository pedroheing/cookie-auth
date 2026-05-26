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
		it('should acquire the lock after waiting for release', async () => {
			const key = 'key';
			const releaseTimeout = 500;
			const acquireTimeout = 1500;
			const lockFirstProcess = await distributedLockService.acquire(key);
			setTimeout(() => {
				void lockFirstProcess.release();
			}, releaseTimeout);
			const startTime = Date.now();

			const lockSecondProcess = await distributedLockService.acquire(key, {
				timeout: acquireTimeout,
			});

			try {
				expect(lockSecondProcess).toBeDefined();
				const duration = Date.now() - startTime;
				expect(duration).toBeGreaterThanOrEqual(releaseTimeout);
				expect(duration).toBeLessThan(acquireTimeout);
			} finally {
				await lockSecondProcess.release();
			}
		});

		it('should set the correct TTL on Redis to prevent dead locks', async () => {
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

		it('should not expire while the process is running', async () => {
			const key = 'heartbeat_key';
			const lock = await distributedLockService.acquire(key, {
				expirationTimeInSeconds: 1,
			});
			try {
				await new Promise((r) => setTimeout(r, 1500));
				await expect(
					distributedLockService.acquire(key, {
						timeout: 100,
					}),
				).rejects.toThrow(Error);
			} finally {
				await lock.release();
			}
		});

		it('should throw an error when it times out', async () => {
			const key = 'key';
			const lock = await distributedLockService.acquire(key);
			try {
				await expect(
					distributedLockService.acquire(key, {
						timeout: 100,
					}),
				).rejects.toThrow(Error);
			} finally {
				await lock.release();
			}
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
