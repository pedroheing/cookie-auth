import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisConfig, redisConfigRegistration } from 'src/config/redis.config';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
	constructor(@Inject(redisConfigRegistration.KEY) redisConfig: RedisConfig) {
		super({
			host: redisConfig.host,
			port: redisConfig.port,
			lazyConnect: true,
		});
	}

	async onModuleInit() {
		await this.connect();
	}

	async onModuleDestroy() {
		await this.quit();
	}
}
