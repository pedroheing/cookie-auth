import { RedisService } from '../redis/redis.service';
import { EventEmitter } from 'events';

export class Lock extends EventEmitter {
	private renewLockInterval: NodeJS.Timeout | null = null;

	constructor(
		private readonly redisService: RedisService,
		private readonly key: string,
		private readonly value: string,
		private readonly lockExpirationTimeInSeconds: number,
	) {
		super();
		this.startAutoRenew();
	}

	private stopAutoRenew() {
		if (this.renewLockInterval) {
			clearInterval(this.renewLockInterval);
			this.renewLockInterval = null;
		}
	}

	private startAutoRenew() {
		if (this.renewLockInterval) {
			this.stopAutoRenew();
		}
		const renewPeriodInMs = Math.floor(this.lockExpirationTimeInSeconds / 2) * 1000;
		if (renewPeriodInMs <= 0) {
			return;
		}
		this.renewLockInterval = setInterval(() => this.renewLock(), renewPeriodInMs);
	}

	private async renewLock() {
		try {
			const result = await this.redisService.renewLock(this.key, this.value, this.lockExpirationTimeInSeconds);
			if (result === 0) {
				this.handleLockLost(new Error(`Lock on key "${this.key}" was lost during renewal.`));
			}
		} catch (error) {
			this.handleLockLost(error);
		}
	}

	private handleLockLost(error: Error) {
		this.stopAutoRenew();
		this.emit('lost', error);
	}

	public async release(): Promise<boolean> {
		this.stopAutoRenew();
		const result = await this.redisService.releaseLock(this.key, this.value);
		return result === 1;
	}
}
