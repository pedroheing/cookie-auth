import { Injectable } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import { v4 as uuidv4 } from 'uuid';
import { DistributedLockConfigService } from './distributed-lock-config.service';
import { Lock } from './lock/lock';
import { LockService } from './lock/lock.interface';

export interface DistributedLockOptions {
	/**
	 * Max amount of time an item can remain in the queue before acquiring the lock.
	 *
	 * @default undefined (Never)
	 */
	timeout?: number | undefined;

	/**
	 * Max amount of time a lock should be held for in seconds
	 *
	 * @default DistributedLockConfig.expirationTimeInSeconds
	 */
	expirationTimeInSeconds?: number | undefined;
}

@Injectable()
export class DistributedLockService {
	constructor(
		private readonly lockService: LockService,
		private readonly distributedLockConfigService: DistributedLockConfigService,
	) {}

	async acquire(key: string, options?: DistributedLockOptions): Promise<Lock> {
		const lockValue = uuidv4();
		const lockExpirationTimeInSeconds = options?.expirationTimeInSeconds ?? this.distributedLockConfigService.expirationTimeInSeconds;
		const timeoutInMs = options?.timeout;
		const startTime = Date.now();

		while (true) {
			if (timeoutInMs && Date.now() - startTime > timeoutInMs) {
				throw new Error('Timeout: Failed to acquire lock');
			}
			const sucess = await this.lockService.acquire(key, lockValue, lockExpirationTimeInSeconds);
			if (sucess) {
				return new Lock(this.lockService, key, lockValue, lockExpirationTimeInSeconds);
			}
			const jitter = Math.floor(Math.random() * 40);
			await setTimeout(80 + jitter); // 80 - 120 ms
		}
	}
}
