import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { Lock } from './lock';
import { DistributedLockConfig, distributedLockConfigRegistration } from 'src/config/distributed-lock.config';
import { v4 as uuidv4 } from 'uuid';
import { setTimeout } from 'node:timers/promises';

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
		private readonly redisService: RedisService,
		@Inject(distributedLockConfigRegistration.KEY) private readonly distributedLockConfig: DistributedLockConfig,
	) {}

	async acquire(key: string, options?: DistributedLockOptions): Promise<Lock> {
		const lockValue = uuidv4();
		const lockExpirationTimeInSeconds = options?.expirationTimeInSeconds ?? this.distributedLockConfig.expirationTimeInSeconds;
		const timeoutInMs = options?.timeout;
		const startTime = Date.now();

		while (true) {
			if (timeoutInMs && Date.now() - startTime > timeoutInMs) {
				throw new Error('Timeout: Failed to acquire lock');
			}
			const result = await this.redisService.set(key, lockValue, 'EX', lockExpirationTimeInSeconds, 'NX');
			if (result === 'OK') {
				return new Lock(this.redisService, key, lockValue, lockExpirationTimeInSeconds);
			}
			const jitter = Math.floor(Math.random() * 40);
			await setTimeout(80 + jitter); // 80 - 120 ms
		}
	}
}
