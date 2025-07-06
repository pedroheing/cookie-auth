import { RedisService } from '../redis/redis.service';

export class Lock {
	private renewLockInterval: NodeJS.Timeout;

	constructor(
		private readonly redisService: RedisService,
		private readonly key: string,
		private readonly value: string,
		private readonly lockExpirationTimeInSeconds: number,
	) {
		this.createRenewLockInterval();
	}

	private clearRenewLockInterval() {
		clearInterval(this.renewLockInterval);
	}

	private createRenewLockInterval() {
		if (this.renewLockInterval) {
			this.clearRenewLockInterval();
		}
		this.renewLockInterval = setInterval(
			async () => {
				try {
					const result = await this.redisService.renewLock(this.key, this.value, this.lockExpirationTimeInSeconds);
					if (result === 0) {
						this.clearRenewLockInterval();
					}
				} catch (e) {
					this.clearRenewLockInterval();
				}
			},
			Math.floor(this.lockExpirationTimeInSeconds / 2) * 1000,
		);
	}

	public async release(): Promise<void> {
		this.clearRenewLockInterval();
		await this.redisService.releaseLock(this.key, this.value);
	}
}
