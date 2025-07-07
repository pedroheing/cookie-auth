import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisConfig, redisConfigRegistration } from 'src/config/redis.config';

declare module 'ioredis' {
	interface Redis {
		renewLock(key: string, value: string, ttl: number): Promise<number>;
		releaseLock(key: string, value: string): Promise<number>;
		unlinkPattern(pattern: string): Promise<number>;
		/**
		 * Gets the value of the first key that matches the pattern
		 * @param pattern
		 */
		getPattern(pattern: string): Promise<string | null>;
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
		this.defineCommand('unlinkPattern', {
			numberOfKeys: 0,
			lua: `
				local cursor = 0
				local dels = 0

				repeat
					local result = redis.call('SCAN', cursor, 'MATCH', ARGV[1], 'COUNT', 1000)

					for _, key in ipairs(result[2]) do
						redis.call('UNLINK', key)
						dels = dels + 1
					end

					cursor = tonumber(result[1])
				until cursor == 0

				return dels
            `,
		});
		this.defineCommand('getPattern', {
			numberOfKeys: 0,
			lua: `
				local result = redis.call('SCAN', 0, 'MATCH', ARGV[1], 'COUNT', 1)
				local list = result[2]
				if #list > 0 then
					return redis.call('GET', result[2][1])
				end
            `,
		});
	}
}
