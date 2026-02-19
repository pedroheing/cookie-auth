import { Injectable } from '@nestjs/common';
import { Session, SessionStatus } from '@prisma/client';
import { addDays, isAfter, isBefore, subHours } from 'date-fns';
import * as crypto from 'node:crypto';
import { CacheService } from 'src/common/cache/cache.interface';
import { DistributedLockService } from 'src/common/distributed-lock/distributed-lock.service';
import { PrismaService, PrismaTx } from 'src/common/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { AuthConfigService } from '../config/auth-config.service';

interface CreateSessionResult {
	session: Session;
	sessionToken: string;
}

interface ValidateUserSessionResult {
	isValid: boolean;
	userId?: number;
	/**Only has value if token was refreshed */
	newSessionToken?: string;
}

@Injectable()
export class SessionService {
	constructor(
		private readonly authConfigService: AuthConfigService,
		private readonly distributedLockService: DistributedLockService,
		private readonly cacheService: CacheService,
		private readonly prismaService: PrismaService,
	) {}

	public async validateAndRefreshSession(sessionToken: string): Promise<ValidateUserSessionResult> {
		const tokenHash = this.createSessionTokenHash(sessionToken);
		return this.validateAndRefreshSessionByHash(tokenHash);
	}

	private async validateAndRefreshSessionByHash(tokenHash: string): Promise<ValidateUserSessionResult> {
		const invalidSessionResult: ValidateUserSessionResult = {
			isValid: false,
		};
		const session = await this.getSessionFromCacheOrDatabase(tokenHash);
		if (!session) {
			return invalidSessionResult;
		}
		if (session.status !== SessionStatus.Active) {
			return invalidSessionResult;
		}
		const hasSessionExpired = isAfter(new Date(), session.expires_at);
		if (hasSessionExpired) {
			return invalidSessionResult;
		}
		const hasTokenExpired = isBefore(session.last_token_issued_at, subHours(new Date(), this.authConfigService.sessionTokenTTLInHours));
		if (hasTokenExpired) {
			return this.renewToken(session, tokenHash);
		}
		return { isValid: true, userId: session.user_id };
	}

	private async renewToken(session: Session, oldSessionTokenHash: string): Promise<ValidateUserSessionResult> {
		const lockKey = `lock:session-refresh:${oldSessionTokenHash}`;
		const lock = await this.distributedLockService.acquire(lockKey);
		try {
			const sessionTokenRefreshResultKey = `refreshed:session:${oldSessionTokenHash}`;
			const newSessionTokenHash = await this.cacheService.get(sessionTokenRefreshResultKey);
			if (newSessionTokenHash) {
				return this.validateAndRefreshSessionByHash(newSessionTokenHash);
			}
			const refreshResult = await this.refreshSessionToken(session.session_id);
			await this.addSessionToCache(refreshResult.session);
			// allows older session to be valid for an extra time to finish concurrent calls
			await this.cacheService.setExpiration(
				this.buildRedisSessionKey(oldSessionTokenHash),
				this.authConfigService.authSessionCacheTTLAfterTokenRefreshInSeconds,
			);
			// stores result of the token refresh for the next concurrent call on the queue
			await this.cacheService.set(
				sessionTokenRefreshResultKey,
				this.createSessionTokenHash(refreshResult.sessionToken),
				this.authConfigService.authSessionTokenRefreshedCacheTTLInSeconds,
			);
			return { isValid: true, userId: session.user_id, newSessionToken: refreshResult.sessionToken };
		} finally {
			await lock.release();
		}
	}

	private async getSessionFromCacheOrDatabase(tokenHash: string): Promise<Session | null> {
		const cachedSession = await this.getSessionFromCache(tokenHash);
		if (cachedSession) {
			return cachedSession;
		}
		const dbSession = await this.prismaService.session.findUnique({
			where: {
				token_hash: tokenHash,
			},
		});
		if (dbSession) {
			await this.addSessionToCache(dbSession);
		}
		return dbSession;
	}

	private async getSessionFromCache(tokenHash: string): Promise<Session | null> {
		const sessionCache = await this.cacheService.get(this.buildRedisSessionKey(tokenHash));
		if (sessionCache) {
			const session = JSON.parse(sessionCache);
			return {
				created_at: new Date(session.created_at),
				expires_at: new Date(session.expires_at),
				fingerprint_hash: session.fingerprint_hash,
				last_token_issued_at: new Date(session.last_token_issued_at),
				session_id: session.session_id,
				status: session.status,
				token_hash: session.token_hash,
				user_id: session.user_id,
			};
		}
		return null;
	}

	private async refreshSessionToken(sessionId: number): Promise<CreateSessionResult> {
		const sessionToken = this.generateNewSessionToken();
		const refreshTime = new Date();
		const session = await this.prismaService.session.update({
			where: {
				session_id: sessionId,
			},
			data: {
				last_token_issued_at: refreshTime,
				token_hash: this.createSessionTokenHash(sessionToken),
				expires_at: this.getSessionExpirationDate(refreshTime),
			},
		});
		return { session, sessionToken };
	}

	public async create(userId: number, tx?: PrismaTx): Promise<CreateSessionResult> {
		const prismaService = tx ?? this.prismaService;
		const sessionToken = this.generateNewSessionToken();
		const issuedAt = new Date();
		const session = await prismaService.session.create({
			data: {
				token_hash: this.createSessionTokenHash(sessionToken),
				last_token_issued_at: issuedAt,
				status: SessionStatus.Active,
				expires_at: this.getSessionExpirationDate(issuedAt),
				user_id: userId,
			},
		});
		await this.addSessionToCache(session);
		return { session, sessionToken };
	}

	public async revokeSession(sessionToken: string): Promise<void> {
		const tokenHash = this.createSessionTokenHash(sessionToken);
		await this.prismaService.session.updateMany({
			where: {
				token_hash: tokenHash,
				status: SessionStatus.Active,
			},
			data: {
				status: SessionStatus.Revoked,
			},
		});
		await this.removeSessionFromCache(tokenHash);
	}

	public async revokeAllBut(userId: number, sessionTokenToKeep: string, tx?: PrismaTx): Promise<void> {
		const prismaService = tx ?? this.prismaService;
		const openSessions = await prismaService.session.findMany({
			where: {
				user_id: userId,
				NOT: {
					token_hash: this.createSessionTokenHash(sessionTokenToKeep),
				},
				status: SessionStatus.Active,
			},
			select: {
				session_id: true,
				token_hash: true,
			},
		});
		if (openSessions.length === 0) {
			return;
		}
		const ids: number[] = [];
		const hashes: string[] = [];
		for (const session of openSessions) {
			ids.push(session.session_id);
			hashes.push(session.token_hash);
		}
		await prismaService.session.updateMany({
			where: {
				session_id: {
					in: ids,
				},
			},
			data: {
				status: SessionStatus.Revoked,
			},
		});
		await this.removeSessionFromCache(hashes);
	}

	private generateNewSessionToken() {
		return uuidv4();
	}

	private getSessionExpirationDate(issuedAt: Date) {
		return addDays(issuedAt, this.authConfigService.sessionLifespanInDays);
	}

	private async addSessionToCache(session: Session): Promise<void> {
		await this.cacheService.set(this.buildRedisSessionKey(session.token_hash), JSON.stringify(session), this.authConfigService.cacheLifespanInSeconds);
	}

	private async removeSessionFromCache(tokenHash: string | string[]): Promise<void> {
		const hashes = Array.isArray(tokenHash) ? tokenHash : [tokenHash];
		await this.cacheService.delete(hashes.map((t) => this.buildRedisSessionKey(t)));
	}

	private buildRedisSessionKey(tokenHash: string) {
		return `session:${tokenHash}`;
	}

	private createSessionTokenHash(sessionToken: string) {
		return crypto.createHash('sha256').update(sessionToken).digest('hex');
	}
}
