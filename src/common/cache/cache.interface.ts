export abstract class CacheService {
	abstract get(key: string): Promise<string | null>;
	abstract set(key: string, value: string, ttlSeconds?: number): Promise<void>;
	abstract delete(keys: string | string[]): Promise<boolean>;
	abstract setExpiration(key: string, ttlSeconds: number): Promise<boolean>;
}
