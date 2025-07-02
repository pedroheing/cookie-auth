import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, Session, SessionStatus } from '@prisma/client';
import { RedisService } from 'src/common/redis/redis.service';
import { SignUpDto } from './dto/sign-up.dto';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import * as crypto from 'node:crypto';
import { PrismaService, PrismaTx } from 'src/common/prisma/prisma.service';
import authConfigRegistration, { AuthConfig } from 'src/config/auth.config';
import { PasswordHashingService } from 'src/common/password-hashing/password-hashing.service';

interface SessionCachePayload {
	userId: number;
	status: SessionStatus;
	expiresAt: Date;
}

interface CreateSessionResult {
	session: Session;
	sessionToken: string;
}

@Injectable()
export class AuthService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly redisService: RedisService,
		private readonly passwordHashService: PasswordHashingService,
		@Inject(authConfigRegistration.KEY) private readonly authConfig: AuthConfig,
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
					throw err;
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

	public async signOut(sessionToken: string) {
		const tokenHash = this.getSessionTokenHash(sessionToken);
		const session = await this.prismaService.session.findUnique({
			where: {
				token_hash: tokenHash,
			},
			select: {
				status: true,
				token_hash: true,
			},
		});
		if (!session || session.status === SessionStatus.Revoked) {
			return;
		}
		// removes first from cache due to racing conditions
		await this.removeSessionFromCache(session.token_hash);
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
		const cachePayload: SessionCachePayload = {
			userId: session.user_id,
			status: session.status,
			expiresAt: session.expires_at,
		};
		await this.redisService.set(this.getRedisSessionKey(session.token_hash), JSON.stringify(cachePayload), 'EX', this.authConfig.cacheLifespanInSeconds);
	}

	private async removeSessionFromCache(tokenHash: string): Promise<void> {
		await this.redisService.del(this.getRedisSessionKey(tokenHash));
	}

	private generateNewSessionToken() {
		return uuidv4();
	}

	private getSessionExpirationDate(issuedAt: Date) {
		return addDays(issuedAt, this.authConfig.sessionLifespanInDays);
	}

	private getRedisSessionKey(tokenHash: string) {
		return `session:${tokenHash}`;
	}

	private getSessionTokenHash(sessionToken: string) {
		return crypto.createHash('sha256').update(sessionToken).digest('hex');
	}
}
