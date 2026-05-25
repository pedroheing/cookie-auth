import { Test, TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';
import { DistributedLockConfigService } from './distributed-lock-config.service';
import { DistributedLockService } from './distributed-lock.service';
import { LockService } from './lock/lock.interface';

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
	});

	describe('acquire', () => {
		it('should acquire the lock', async () => {
			// Arrange
			const key = 'key';
			lockService.acquire.mockResolvedValue(true);

			// Act
			const lock = await distributedLockService.acquire(key);

			// Assert
			expect(lock).toBeDefined();
			expect(lock.key).toBe(key);
		});

		it('should use the expiration time parameter when provided', async () => {
			// Arrange
			const key = 'key';
			const expirationTime = 10;
			lockService.acquire.mockResolvedValue(true);

			// Act
			const lock = await distributedLockService.acquire(key, {
				expirationTimeInSeconds: expirationTime,
			});

			// Assert
			expect(lock).toBeDefined();
			expect(lock.lockExpirationTimeInSeconds).toBe(expirationTime);
		});

		it('should acquire the lock after retrying when the lock was in use and then was released', async () => {
			// Arrange
			const key = 'key';
			// first call should return null, simulating that the key was taken by other service
			// second call should return OK, simulating tha the key was released
			lockService.acquire.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

			// Act
			const lock = await distributedLockService.acquire(key);

			// Assert
			expect(lock).toBeDefined();
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
		});
	});
});
