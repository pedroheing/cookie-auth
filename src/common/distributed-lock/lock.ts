import { RedisService } from '../redis/redis.service';

export class Lock {
	constructor(
		private readonly redisService: RedisService,
		private readonly key: string,
	) {}

	async release() {
		await this.redisService.del(this.key);
	}
}
