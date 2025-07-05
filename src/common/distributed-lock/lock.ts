import { RedisService } from '../redis/redis.service';

export class Lock {
	private renewLockInterval: NodeJS.Timeout;

	constructor(
		private readonly redisService: RedisService,
		private readonly key: string,
		private readonly lockExpirationTimeInSeconds: number,
	) {
		this.createRenewLockInterval();
	}

	private createRenewLockInterval() {
		if (this.renewLockInterval) {
			clearInterval(this.renewLockInterval);
		}
		this.renewLockInterval = setInterval(
			() => {
				this.redisService.expire(this.key, this.lockExpirationTimeInSeconds);
			},
			Math.floor(this.lockExpirationTimeInSeconds / 2) * 1000,
		);
	}

	public async release(): Promise<void> {
		clearInterval(this.renewLockInterval);
		await this.redisService.del(this.key);
	}
}
