import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { Lock } from './lock';

interface DistributedLockOptions {
	/**
	 * Max amount of time an item can remain in the queue before acquiring the lock.
	 *
	 * @default 0 (Never)
	 */
	timeout?: number | undefined;
}

@Injectable()
export class DistributedLockService {
	constructor(private readonly redisService: RedisService) {}

	acquire(key: string, options?: DistributedLockOptions) {
		return new Promise<Lock>((resolve, reject) => {
			const lockValue = 'locked';

			const acquireLock = () => {
				this.redisService.setnx(key, lockValue, (err, result) => {
					if (err) {
						reject(err);
					} else if (result === 1) {
						resolve(new Lock(this.redisService, key));
					} else {
						setTimeout(acquireLock, 100);
					}
				});
			};

			acquireLock();

			if (options?.timeout) {
				setTimeout(() => {
					reject(new Error('Timeout: Failed to acquire lock'));
				}, options.timeout);
			}
		});
	}
}
