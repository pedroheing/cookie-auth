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

	acquire(key: string, options?: DistributedLockOptions): Promise<Lock> {
		return new Promise<Lock>((resolve, reject) => {
			const lockValue = uuidv4();
			const lockExpirationTimeInSeconds = options?.expirationTimeInSeconds ?? this.distributedLockConfig.expirationTimeInSeconds;
			let timeoutCheck: NodeJS.Timeout;
			let isTimedOut = false;

			const acquireLock = () => {
				// only sets if the key doesn't exist - VERY IMPORTANT
				this.redisService.set(key, lockValue, 'EX', lockExpirationTimeInSeconds, 'NX', (err, result) => {
					if (isTimedOut) {
						return;
					}
					if (err) {
						reject(err);
					} else if (result === 'OK') {
						clearTimeout(timeoutCheck);
						resolve(new Lock(this.redisService, key, lockValue, lockExpirationTimeInSeconds));
					} else {
						setTimeout(acquireLock, 80 + Math.floor(Math.random() * 40)); // Jitter - 80-120 ms
					}
				});
			};

			acquireLock();

			if (options?.timeout) {
				timeoutCheck = setTimeout(() => {
					isTimedOut = true;
					reject(new Error('Timeout: Failed to acquire lock'));
				}, options.timeout);
			}
		});
	}
}
