import { ConflictException, Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, Session, SessionStatus, User } from '@prisma/client';
import { RedisService } from 'src/common/redis/redis.service';
import { SignUpDto } from './dto/sign-up.dto';
import { v4 as uuidv4 } from 'uuid';
import { addDays, isAfter, isBefore, subHours } from 'date-fns';
import * as crypto from 'node:crypto';
import { PrismaService, PrismaTx } from 'src/common/prisma/prisma.service';
import { AuthConfig, authConfigRegistration } from 'src/config/auth.config';
import { PasswordHashingService } from 'src/common/password-hashing/password-hashing.service';
import { DistributedLockService } from 'src/common/distributed-lock/distributed-lock.service';

interface CreateSessionResult {
	session: Session;
	sessionToken: string;
}

interface ValidateUserSessionResult {
	userId: number;
	/**Only has value if token was refreshed */
	newSessionToken?: string;
}

interface ChangePasswordInput {
	userId: number;
	sessionToken: string;
	currentPassword: string;
	newPassword: string;
}

@Injectable()
export class AuthService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly redisService: RedisService,
		private readonly passwordHashService: PasswordHashingService,
		@Inject(authConfigRegistration.KEY) private readonly authConfig: AuthConfig,
		private readonly distributedLockService: DistributedLockService,
	) {}

	public async signUp(dto: SignUpDto): Promise<string> {
		const hashedPassword = await this.passwordHashService.hash(dto.password);
		const result = await this.prismaService.$transaction(async (tx: PrismaTx) => {
			const user = await tx.user
				.create({
					data: {
						first_name: dto.firstName,
						last_name: dto.lastName,
						username: dto.username,
						password: hashedPassword,
					},
				})
				.catch((err) => {
					if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
						throw new ConflictException('Username already in use.');
					}
					throw new InternalServerErrorException('An unexpected DB error occurred.');
				});
			return this.createSession(user.user_id, tx);
		});
		await this.addSessionToCache(result.session);
		return result.sessionToken;
	}

	public async signIn(username: string, password: string) {
		const user = await this.prismaService.user.findUnique({
			where: {
				username: username,
			},
			select: {
				user_id: true,
				username: true,
				password: true,
			},
		});
		// creates dummy password as default to prevent timing attacks
		let userPassword = await this.passwordHashService.hash('a-very-long-and-very-secure-password');
		if (user) {
			userPassword = user.password;
		}
		const isValid = await this.passwordHashService.verify(userPassword, password);
		if (!isValid || !user) {
			throw new UnauthorizedException('Incorrect username or password');
		}
		const result = await this.createSession(user.user_id);
		await this.addSessionToCache(result.session);
		return result.sessionToken;
	}

	public async signOut(sessionToken: string): Promise<void> {
		const tokenHash = this.getSessionTokenHash(sessionToken);
		const session = await this.prismaService.session.findUnique({
			where: {
				token_hash: tokenHash,
			},
			select: {
				status: true,
				token_hash: true,
				user_id: true,
			},
		});
		if (!session || session.status === SessionStatus.Revoked) {
			return;
		}
		// removes first from cache as is the first to be checked
		await this.removeSessionFromCache(session.user_id, session.token_hash);
		await this.prismaService.session.update({
			where: {
				token_hash: tokenHash,
				status: SessionStatus.Active,
			},
			data: {
				status: SessionStatus.Revoked,
			},
		});
	}

	public async changePassword(input: ChangePasswordInput): Promise<void> {
		const user = await this.prismaService.user.findUnique({
			where: {
				user_id: input.userId,
			},
			select: {
				user_id: true,
				password: true,
			},
		});
		if (!user) {
			throw new NotFoundException('User not found');
		}
		const isCurrentPasswordValid = await this.passwordHashService.verify(user.password, input.currentPassword);
		if (!isCurrentPasswordValid) {
			throw new UnauthorizedException('It was not possible to verify your current password');
		}
		const newPassWordHash = await this.passwordHashService.hash(input.newPassword);
		return this.prismaService
			.$transaction(async (tx: PrismaTx) => {
				await tx.user.update({
					where: {
						user_id: user.user_id,
					},
					data: {
						password: newPassWordHash,
					},
				});
				await tx.session.updateMany({
					where: {
						user_id: user.user_id,
						NOT: {
							token_hash: this.getSessionTokenHash(input.sessionToken),
						},
					},
					data: {
						status: SessionStatus.Revoked,
					},
				});
				await this.removeAllUserSessionsFromCache(user.user_id);
			})
			.catch(() => {
				throw new InternalServerErrorException('It was not possible to change your password. Try again later.');
			});
	}

	public async validateSession(sessionToken: string): Promise<ValidateUserSessionResult | null> {
		const tokenhash = this.getSessionTokenHash(sessionToken);
		return this._validateSession(tokenhash);
	}

	private async _validateSession(tokenHash: string): Promise<ValidateUserSessionResult | null> {
		const session = await this.getSessionFromCacheOrDatabase(tokenHash);
		if (!session) {
			return null;
		}
		if (session.status !== SessionStatus.Active) {
			return null;
		}
		const hasSessionExpired = isAfter(new Date(), session.expires_at);
		if (hasSessionExpired) {
			return null;
		}
		const hasTokenExpired = isBefore(session.last_token_issued_at, subHours(new Date(), this.authConfig.sessionTokenTTLInHours));
		if (hasTokenExpired) {
			return this.renewToken(session, tokenHash);
		}
		return { userId: session.user_id };
	}

	private async renewToken(session: Session, oldSessionTokenhash: string): Promise<ValidateUserSessionResult | null> {
		const lockKey = `lock:session-refresh:${oldSessionTokenhash}`;
		const lock = await this.distributedLockService.acquire(lockKey);
		try {
			const sessionTokenRefreshResultKey = `refreshed:session:${oldSessionTokenhash}`;
			const newSessionTokenHash = await this.redisService.get(sessionTokenRefreshResultKey);
			if (newSessionTokenHash) {
				return this._validateSession(newSessionTokenHash);
			}
			const refreshResult = await this.refreshSessionToken(session.session_id);
			await this.addSessionToCache(refreshResult.session);
			// allows older session to be valid for an extra time to finish concurrent calls
			await this.redisService.expire(
				this.buildRedisSessionKey(session.user_id, oldSessionTokenhash),
				this.authConfig.authSessionCacheTTLAterTokenRefreshInSeconds,
			);
			// stores result of the token refresh for the next concurrent call on the queue
			await this.redisService.setex(
				sessionTokenRefreshResultKey,
				this.authConfig.authSessionTokenRefreshedCacheTTLInSeconds,
				this.getSessionTokenHash(refreshResult.sessionToken),
			);
			return { userId: session.user_id, newSessionToken: refreshResult.sessionToken };
		} finally {
			await lock.release();
		}
	}

	private async getSessionFromCacheOrDatabase(tokenHash: string): Promise<Session | null> {
		const cachedSession = await this.getSessionFromCache(tokenHash);
		if (cachedSession) {
			await this.redisService.expire(this.buildRedisSessionKey(cachedSession.user_id, tokenHash), this.authConfig.cacheLifespanInSeconds);
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

	private async refreshSessionToken(sessionId: number): Promise<CreateSessionResult> {
		const sessionToken = this.generateNewSessionToken();
		const refreshTime = new Date();
		const session = await this.prismaService.session.update({
			where: {
				session_id: sessionId,
			},
			data: {
				last_token_issued_at: refreshTime,
				token_hash: this.getSessionTokenHash(sessionToken),
				expires_at: this.getSessionExpirationDate(refreshTime),
			},
		});
		return { session, sessionToken };
	}

	private async createSession(userId: number, tx?: PrismaTx): Promise<CreateSessionResult> {
		const prismaService = tx ?? this.prismaService;
		const sessionToken = this.generateNewSessionToken();
		const issuedAt = new Date();
		const session = await prismaService.session.create({
			data: {
				token_hash: this.getSessionTokenHash(sessionToken),
				last_token_issued_at: issuedAt,
				status: SessionStatus.Active,
				expires_at: this.getSessionExpirationDate(issuedAt),
				user_id: userId,
			},
		});
		return { session, sessionToken };
	}

	private async addSessionToCache(session: Session): Promise<void> {
		await this.redisService.set(
			this.buildRedisSessionKey(session.user_id, session.token_hash),
			JSON.stringify(session),
			'EX',
			this.authConfig.cacheLifespanInSeconds,
		);
	}

	private async removeSessionFromCache(userId: number, tokenHash: string): Promise<void> {
		await this.redisService.unlink(this.buildRedisSessionKey(userId, tokenHash));
	}

	private async removeAllUserSessionsFromCache(userId: number): Promise<void> {
		await this.redisService.unlinkPattern(this.buildRedisSessionKey(userId, '*'));
	}

	private async getSessionFromCache(tokenhash: string): Promise<Session | null> {
		const sessionCache = await this.redisService.getPattern(this.buildRedisSessionKey('*', tokenhash));
		if (sessionCache) {
			return JSON.parse(sessionCache);
		}
		return null;
	}

	private generateNewSessionToken() {
		return uuidv4();
	}

	private getSessionExpirationDate(issuedAt: Date) {
		return addDays(issuedAt, this.authConfig.sessionLifespanInDays);
	}

	private buildRedisSessionKey(userId: number | '*', tokenHash: string) {
		return `session:${userId}:${tokenHash}`;
	}

	private getSessionTokenHash(sessionToken: string) {
		return crypto.createHash('sha256').update(sessionToken).digest('hex');
	}
}
