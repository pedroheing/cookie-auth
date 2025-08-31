import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { Lock } from './lock';
import { DistributedLockConfig, distributedLockConfigRegistration } from 'src/config/distributed-lock.config';
import { v4 as uuidv4 } from 'uuid';

interface DistributedLockOptions {
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
		const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

		while (true) {
			if (timeoutInMs && Date.now() - startTime > timeoutInMs) {
				throw new Error('Timeout: Failed to acquire lock');
			}
			try {
				const result = await this.redisService.set(key, lockValue, 'EX', lockExpirationTimeInSeconds, 'NX');
				if (result === 'OK') {
					return new Lock(this.redisService, key, lockValue, lockExpirationTimeInSeconds);
				}
			} catch (err) {
				throw err;
			}
			const jitter = Math.floor(Math.random() * 40);
			await delay(80 + jitter); // 80 - 120 ms
		}
	}
}
