import { EventEmitter } from 'events';
import { LockService } from './lock.interface';

export class Lock extends EventEmitter {
	private renewLockInterval: NodeJS.Timeout | null = null;

	constructor(
		private readonly lockService: LockService,
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
			const sucess = await this.lockService.renew(this.key, this.value, this.lockExpirationTimeInSeconds);
			if (!sucess) {
				this.handleLockLost(new Error(`Lock on key "${this.key}" was lost during renewal.`));
			}
		} catch (error: any) {
			this.handleLockLost(error);
		}
	}

	private handleLockLost(error: Error) {
		this.stopAutoRenew();
		this.emit('lost', error);
	}

	public async release(): Promise<boolean> {
		this.stopAutoRenew();
		const sucess = await this.lockService.release(this.key, this.value);
		return sucess;
	}
}
