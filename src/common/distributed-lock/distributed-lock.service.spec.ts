import { Test, TestingModule } from '@nestjs/testing';
import { DistributedLockOptions, DistributedLockService } from './distributed-lock.service';
import { RedisService } from '../redis/redis.service';
import { distributedLockConfigRegistration } from 'src/config/distributed-lock.config';
import { Lock } from './lock';
import { mock } from 'jest-mock-extended';

const distributedLockConfigMock: DistributedLockOptions = {
	expirationTimeInSeconds: 30,
};

jest.mock('./lock');

jest.mock('node:timers/promises', () => {
	return {
		setTimeout: jest.fn(),
	};
});

describe('DistributedLockService', () => {
	let distributedLockService: DistributedLockService;
	const redisService = mock<RedisService>();

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				DistributedLockService,
				{ provide: RedisService, useValue: redisService },
				{ provide: distributedLockConfigRegistration.KEY, useValue: distributedLockConfigMock },
			],
		}).compile();
		distributedLockService = module.get<DistributedLockService>(DistributedLockService);
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
			redisService.set.mockResolvedValue('OK');

			// Act
			await distributedLockService.acquire(key);

			// Assert
			const lockValue = (redisService.set as jest.Mock).mock.calls[0][1];
			expect(Lock.prototype.constructor).toHaveBeenCalledWith(redisService, key, lockValue, distributedLockConfigMock.expirationTimeInSeconds);
			expect(redisService.set).toHaveBeenCalledWith(key, lockValue, 'EX', distributedLockConfigMock.expirationTimeInSeconds, 'NX');
		});

		it('should use the expiration time parameter when provided', async () => {
			// Arrange
			const key = 'key';
			const expirationTime = 10;
			redisService.set.mockResolvedValue('OK');

			// Act
			await distributedLockService.acquire(key, {
				expirationTimeInSeconds: expirationTime,
			});

			// Assert
			const lockValue = (redisService.set as jest.Mock).mock.calls[0][1];
			expect(Lock.prototype.constructor).toHaveBeenCalledWith(redisService, key, lockValue, expirationTime);
			expect(redisService.set).toHaveBeenCalledWith(key, lockValue, 'EX', expirationTime, 'NX');
		});

		it('should acquire the lock after retrying when the lock was in use and then was released', async () => {
			// Arrange
			const key = 'key';
			// first call should return null, simulating that the key was taken by other service
			// second call should return OK, simulating tha the key was released
			redisService.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');

			// Act
			await distributedLockService.acquire(key);

			// Assert
			const lockValue = (redisService.set as jest.Mock).mock.calls[0][1];
			expect(Lock.prototype.constructor).toHaveBeenCalledWith(redisService, key, lockValue, distributedLockConfigMock.expirationTimeInSeconds);
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
