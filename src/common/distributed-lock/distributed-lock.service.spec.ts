import { Test, TestingModule } from '@nestjs/testing';
import { DistributedLockService } from './distributed-lock.service';
import { RedisService } from '../redis/redis.service';
import { distributedLockConfigRegistration } from 'src/config/distributed-lock.config';
import { Lock } from './lock';

const redisServiceMock = {
	set: jest.fn(),
};

const distributedLockConfigMock = {
	expirationTimeInSeconds: 30,
};

describe('DistributedLockService', () => {
	let distributedLockService: DistributedLockService;
	let redisService: typeof redisServiceMock;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				DistributedLockService,
				{ provide: RedisService, useValue: redisServiceMock },
				{ provide: distributedLockConfigRegistration.KEY, useValue: distributedLockConfigMock },
			],
		}).compile();

		distributedLockService = module.get<DistributedLockService>(DistributedLockService);
		redisService = module.get(RedisService);

		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('should be defined', () => {
		expect(distributedLockService).toBeDefined();
		expect(redisService).toBeDefined();
		expect(distributedLockConfigRegistration.KEY).toBeDefined();
	});

	describe('acquire', () => {
		it('should acquire the lock when successfully setting the redis key', async () => {
			// Arrange
			const key = 'key';
			jest.useFakeTimers();
			redisService.set.mockResolvedValue('OK');

			// Act
			const acquirePromise = distributedLockService.acquire(key);
			await jest.advanceTimersByTimeAsync(150);
			const result = await acquirePromise;

			// Assert
			const lockValue = (redisService.set as jest.Mock).mock.calls[0][1];
			expect(result).toBeInstanceOf(Lock);
			expect(result).toMatchObject({
				redisService: redisService,
				key: key,
				value: lockValue,
				lockExpirationTimeInSeconds: distributedLockConfigMock.expirationTimeInSeconds,
			});
			expect(redisService.set).toHaveBeenCalledWith(key, lockValue, 'EX', distributedLockConfigMock.expirationTimeInSeconds, 'NX');
		});

		it('should use the expiration time parameter when provided', async () => {
			// Arrange
			const key = 'key';
			const expirationTime = 10;
			redisService.set.mockResolvedValue('OK');
			jest.useFakeTimers();

			// Act
			const acquirePromise = distributedLockService.acquire(key, {
				expirationTimeInSeconds: expirationTime,
			});
			await jest.advanceTimersByTimeAsync(150);
			const result = await acquirePromise;

			// Assert
			const lockValue = (redisService.set as jest.Mock).mock.calls[0][1];
			expect(result).toBeInstanceOf(Lock);
			expect(result).toMatchObject({
				redisService: redisService,
				key: key,
				value: lockValue,
				lockExpirationTimeInSeconds: expirationTime,
			});
			expect(redisService.set).toHaveBeenCalledWith(key, lockValue, 'EX', expirationTime, 'NX');
		});

		it('should acquire the lock after retrying when the lock was in use and then was released', async () => {
			// Arrange
			const key = 'key';
			jest.useFakeTimers();
			// first call should return null, simulating that the key was taken by other service
			// second call should return OK, simulating tha the key was released
			redisService.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');

			// Act
			const acquirePromise = distributedLockService.acquire(key);
			await jest.advanceTimersByTimeAsync(150);
			const result = await acquirePromise;

			// Assert
			const lockValue = (redisService.set as jest.Mock).mock.calls[0][1];
			expect(result).toBeInstanceOf(Lock);
			expect(result).toMatchObject({
				redisService: redisService,
				key: key,
				value: lockValue,
				lockExpirationTimeInSeconds: distributedLockConfigMock.expirationTimeInSeconds,
			});
			expect(redisService.set).toHaveBeenCalledTimes(2);
			expect(redisService.set).toHaveBeenCalledWith(key, lockValue, 'EX', distributedLockConfigMock.expirationTimeInSeconds, 'NX');
		});

		it('should throw an error when it times out', async () => {
			// Arrange
			redisService.set.mockResolvedValue(null);

			// Act & Assert
			await expect(
				distributedLockService.acquire('key', {
					timeout: 1,
				}),
			).rejects.toThrow(Error);
			expect(redisService.set).toHaveBeenCalled();
		});

		it('should throw an error when redis set throws an error', async () => {
			// Arrange
			redisService.set.mockRejectedValue(new Error('Generic Redis error'));

			// Act & Assert
			await expect(distributedLockService.acquire('key')).rejects.toThrow(Error);
			expect(redisService.set).toHaveBeenCalled();
		});
	});
});
