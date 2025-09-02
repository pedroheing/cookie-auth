import { setTimeout } from 'node:timers/promises';
import { RedisService } from '../redis/redis.service';

export class Lock {
	private wasReleased: boolean;

	constructor(
		private readonly redisService: RedisService,
		private readonly key: string,
		private readonly value: string,
		private readonly lockExpirationTimeInSeconds: number,
	) {
		this.createRenewLockInterval();
	}

	private async createRenewLockInterval() {
		while (true) {
			if (this.wasReleased) {
				break;
			}
			try {
				const result = await this.redisService.renewLock(this.key, this.value, this.lockExpirationTimeInSeconds);
				if (result === 0) {
					break;
				}
			} catch (e) {
				break;
			}
			await setTimeout(Math.floor(this.lockExpirationTimeInSeconds / 2) * 1000);
		}
	}

	public async release(): Promise<void> {
		this.wasReleased = true;
		await this.redisService.releaseLock(this.key, this.value);
	}
}
