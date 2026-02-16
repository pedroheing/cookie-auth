import { Test, TestingModule } from '@nestjs/testing';
import { DistributedLockOptions, DistributedLockService } from './distributed-lock.service';
import { Lock } from './lock/lock';
import { mock } from 'jest-mock-extended';
import { DistributedLockConfigService } from './distributed-lock-config.service';
import { LockService } from './lock/lock.interface';

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
	const lockService = mock<LockService>();
	const dostributedLockConfigService = mock<DistributedLockConfigService>({
		expirationTimeInSeconds: 30,
	});

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				DistributedLockService,
				{ provide: LockService, useValue: lockService },
				{ provide: DistributedLockConfigService, useValue: dostributedLockConfigService },
			],
		}).compile();
		distributedLockService = module.get<DistributedLockService>(DistributedLockService);
	});

	it('should be defined', () => {
		expect(distributedLockService).toBeDefined();
		expect(lockService).toBeDefined();
		expect(dostributedLockConfigService).toBeDefined();
	});

	describe('acquire', () => {
		it('should acquire the lock when successfully setting the redis key', async () => {
			// Arrange
			const key = 'key';
			lockService.acquire.mockResolvedValue(true);

			// Act
			await distributedLockService.acquire(key);

			// Assert
			const lockValue = (lockService.acquire as jest.Mock).mock.calls[0][1];
			expect(Lock.prototype.constructor).toHaveBeenCalledWith(lockService, key, lockValue, distributedLockConfigMock.expirationTimeInSeconds);
			expect(lockService.acquire).toHaveBeenCalledWith(key, lockValue, distributedLockConfigMock.expirationTimeInSeconds);
		});

		it('should use the expiration time parameter when provided', async () => {
			// Arrange
			const key = 'key';
			const expirationTime = 10;
			lockService.acquire.mockResolvedValue(true);

			// Act
			await distributedLockService.acquire(key, {
				expirationTimeInSeconds: expirationTime,
			});

			// Assert
			const lockValue = (lockService.acquire as jest.Mock).mock.calls[0][1];
			expect(Lock.prototype.constructor).toHaveBeenCalledWith(lockService, key, lockValue, expirationTime);
			expect(lockService.acquire).toHaveBeenCalledWith(key, lockValue, expirationTime);
		});

		it('should acquire the lock after retrying when the lock was in use and then was released', async () => {
			// Arrange
			const key = 'key';
			// first call should return null, simulating that the key was taken by other service
			// second call should return OK, simulating tha the key was released
			lockService.acquire.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

			// Act
			await distributedLockService.acquire(key);

			// Assert
			const lockValue = (lockService.acquire as jest.Mock).mock.calls[0][1];
			expect(Lock.prototype.constructor).toHaveBeenCalledWith(lockService, key, lockValue, distributedLockConfigMock.expirationTimeInSeconds);
			expect(lockService.acquire).toHaveBeenCalledTimes(2);
			expect(lockService.acquire).toHaveBeenCalledWith(key, lockValue, distributedLockConfigMock.expirationTimeInSeconds);
		});

		it('should throw an error when it times out', async () => {
			// Arrange
			lockService.acquire.mockResolvedValue(false);

			// Act & Assert
			await expect(
				distributedLockService.acquire('key', {
					timeout: 1,
				}),
			).rejects.toThrow(Error);
			expect(lockService.acquire).toHaveBeenCalled();
		});

		it('should throw an error when redis set throws an error', async () => {
			// Arrange
			lockService.acquire.mockRejectedValue(new Error('Generic Redis error'));

			// Act & Assert
			await expect(distributedLockService.acquire('key')).rejects.toThrow(Error);
			expect(lockService.acquire).toHaveBeenCalled();
		});
	});
});
