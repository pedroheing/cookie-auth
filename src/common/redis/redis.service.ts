import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisConfig, redisConfigRegistration } from 'src/config/redis.config';

declare module 'ioredis' {
	interface Redis {
		renewLock(key: string, value: string, ttl: number): Promise<number>;
		releaseLock(key: string, value: string): Promise<number>;
	}
}

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
		this.defineLuaCommands();
		await this.connect();
	}

	async onModuleDestroy() {
		await this.quit();
	}

	private defineLuaCommands(): void {
		this.defineCommand('renewLock', {
			numberOfKeys: 1,
			lua: `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("expire", KEYS[1], ARGV[2])
                else
                    return 0
                end
            `,
		});
		this.defineCommand('releaseLock', {
			numberOfKeys: 1,
			lua: `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `,
		});
	}
}
