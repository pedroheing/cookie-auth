export abstract class LockService {
	abstract acquire(key: string, value: string, ttlSeconds: number): Promise<boolean>;
	abstract renew(key: string, value: string, ttlSeconds: number): Promise<boolean>;
	abstract release(key: string, value: string): Promise<boolean>;
}
