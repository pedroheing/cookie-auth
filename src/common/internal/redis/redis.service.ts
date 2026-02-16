import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisConfigService } from './redis-config.service';
import { CacheService } from '../../cache/cache.interface';
import { LockService } from '../../distributed-lock/lock/lock.interface';

declare module 'ioredis' {
	interface Redis {
		renewLock(key: string, value: string, ttl: number): Promise<number>;
		releaseLock(key: string, value: string): Promise<number>;
	}
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, CacheService, LockService {
	private client: Redis;

	constructor(redisConfigService: RedisConfigService) {
		this.client = new Redis({
			host: redisConfigService.host,
			port: redisConfigService.port,
			lazyConnect: true,
		});
	}

	async onModuleInit() {
		this.defineLuaCommands();
		await this.client.connect();
	}

	async onModuleDestroy() {
		await this.client.quit();
	}

	private defineLuaCommands(): void {
		this.client.defineCommand('renewLock', {
			numberOfKeys: 1,
			lua: `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("expire", KEYS[1], ARGV[2])
                else
                    return 0
                end
            `,
		});
		this.client.defineCommand('releaseLock', {
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

	async acquire(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
		return result === 'OK';
	}

	async renew(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		const res = await this.client.renewLock(key, value, ttlSeconds);
		return res === 1;
	}

	async release(key: string, value: string): Promise<boolean> {
		const res = await this.client.releaseLock(key, value);
		return res === 1;
	}

	async get(key: string): Promise<string | null> {
		return this.client.get(key);
	}

	async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
		if (ttlSeconds) {
			await this.client.set(key, value, 'EX', ttlSeconds);
		} else {
			await this.client.set(key, value);
		}
	}

	async delete(keys: string | string[]): Promise<boolean> {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}
		const res = await this.client.unlink(keys);
		return res === 1;
	}

	async setExpiration(key: string, ttlSeconds: number): Promise<boolean> {
		const result = await this.client.expire(key, ttlSeconds);
		return result === 1;
	}
}
