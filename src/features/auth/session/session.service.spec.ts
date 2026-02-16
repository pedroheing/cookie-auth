import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { DistributedLockService } from 'src/common/distributed-lock/distributed-lock.service';
import { Prisma, SessionStatus } from '@prisma/client';
import { addDays, addHours, sub, subHours } from 'date-fns';
import { mock, mockDeep } from 'jest-mock-extended';
import { Lock } from 'src/common/distributed-lock/lock/lock';
import { AuthConfigService } from '../config/auth-config.service';
import { CacheService } from 'src/common/cache/cache.interface';
import { SessionService } from './session.service';

describe('SessionService', () => {
	let sessionService: SessionService;
	const prismaService = mockDeep<PrismaService>();
	const cacheService = mock<CacheService>();
	const distributedLockService = mock<DistributedLockService>();
	const authConfigService = mock<AuthConfigService>({
		sessionLifespanInDays: 10,
		cacheLifespanInSeconds: 30,
		sessionTokenTTLInHours: 24,
		authSessionCacheTTLAterTokenRefreshInSeconds: 60,
		authSessionTokenRefreshedCacheTTLInSeconds: 60,
		cookie: {
			name: 'id',
			httpOnly: true,
			maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
			sameSite: 'lax',
			secure: false,
		},
	});
	const lock = mock<Lock>();

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				SessionService,
				{ provide: PrismaService, useValue: prismaService },
				{ provide: CacheService, useValue: cacheService },
				{ provide: AuthConfigService, useValue: authConfigService },
				{ provide: DistributedLockService, useValue: distributedLockService },
			],
		}).compile();
		sessionService = module.get(SessionService);
		distributedLockService.acquire.mockResolvedValue(lock);
		prismaService.$transaction.mockImplementation(async (callback) => await callback(prismaService));
	});

	it('should be defined', () => {
		expect(sessionService).toBeDefined();
		expect(prismaService).toBeDefined();
		expect(cacheService).toBeDefined();
		expect(authConfigService).toBeDefined();
		expect(distributedLockService).toBeDefined();
	});

	describe('validateSession', () => {
		const currentTokenHash = 'tokenHash';

		beforeEach(() => {
			jest.spyOn(sessionService as any, 'createSessionTokenHash').mockReturnValue(currentTokenHash);
		});

		it('should validate the session and return the user_id', async () => {
			// Arrange
			const session = {
				status: SessionStatus.Active,
				expires_at: addHours(new Date(), 10),
				last_token_issued_at: new Date(),
				user_id: 1,
			};
			jest.spyOn(sessionService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);

			// Act
			const result = await sessionService.validateSession('session-token');

			// Assert
			expect(result).toEqual({ userId: session.user_id });
		});

		test.each([SessionStatus.Revoked, SessionStatus.Expired])('should return null for session with %s status', async (status) => {
			// Arrange
			const session = {
				status: status,
			};
			jest.spyOn(sessionService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);

			// Act
			const result = await sessionService.validateSession('session-token');

			// Assert
			expect(result).toBe(null);
		});

		it('should return null for non-existent session', async () => {
			// Arrange
			jest.spyOn(sessionService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(null);

			// Act
			const result = await sessionService.validateSession('session-token');

			// Assert
			expect(result).toBe(null);
		});

		it('should return null for active session with past expiration date', async () => {
			// Arrange
			const session = {
				status: SessionStatus.Active,
				expires_at: sub(new Date(), {
					hours: 1,
				}),
			};
			jest.spyOn(sessionService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);

			// Act
			const result = await sessionService.validateSession('session-token');

			// Assert
			expect(result).toBe(null);
		});

		it('should refresh expired token and return new session token', async () => {
			// Arrange
			const session = {
				status: SessionStatus.Active,
				expires_at: addHours(new Date(), 1),
				last_token_issued_at: subHours(new Date(), authConfigService.sessionTokenTTLInHours + 1),
				user_id: 1,
			};
			const newSessionToken = 'new-session-token';
			const refreshedSession = {
				status: SessionStatus.Active,
				expires_at: addDays(new Date(), authConfigService.sessionLifespanInDays),
				last_token_issued_at: new Date(),
				user_id: 1,
			};
			jest.spyOn(sessionService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);
			jest.spyOn(sessionService as any, 'generateNewSessionToken').mockReturnValue(newSessionToken);
			cacheService.get.mockResolvedValue(null); // no refresh done, is the winner
			prismaService.session.update.mockResolvedValue(refreshedSession as any);

			// Act
			const result = await sessionService.validateSession('session-token');

			// Assert
			expect(result).toEqual({ userId: session.user_id, newSessionToken: newSessionToken });
			expect(distributedLockService.acquire).toHaveBeenCalled(); // makes sure that it uses a concurrent lock
			expect(lock.release).toHaveBeenCalled(); // IMPORTANT: makes sure that it releases the lock
			expect(prismaService.session.update).toHaveBeenCalled(); // updates the session with new token and expiration dates
			expect(cacheService.get).toHaveBeenCalled(); // tries to find the result of the refresh, done by other call
			expect(cacheService.set).toHaveBeenCalled(); // sets the new session to the cache
			expect(cacheService.setExpiration).toHaveBeenCalled(); // defines expiration date for the old session, so concurrent calls don't fail instantly
			expect(cacheService.set).toHaveBeenCalled(); // sets the result of the refresh
		});

		it('should use the result of refresh token in concurrent call', async () => {
			// Arrange
			const session = {
				status: SessionStatus.Active,
				expires_at: addHours(new Date(), 1),
				last_token_issued_at: subHours(new Date(), authConfigService.sessionTokenTTLInHours + 1),
				user_id: 1,
			};
			const newSessionTokenhash = 'new-session-token-hash';
			const refreshedSession = {
				status: SessionStatus.Active,
				expires_at: addDays(new Date(), authConfigService.sessionLifespanInDays),
				last_token_issued_at: new Date(),
				user_id: 1,
			};
			jest.spyOn(sessionService as any, 'getSessionFromCacheOrDatabase').mockReturnValueOnce(session); // old Session
			cacheService.get.mockResolvedValue(newSessionTokenhash); // the token refresh was done by other call
			jest.spyOn(sessionService as any, 'getSessionFromCacheOrDatabase').mockReturnValueOnce(refreshedSession); // new Session

			// Act
			const result = await sessionService.validateSession('session-token');

			// Assert
			expect(result).toEqual({ userId: session.user_id });
			expect(distributedLockService.acquire).toHaveBeenCalled(); // makes sure that it uses a concurrent lock
			expect(lock.release).toHaveBeenCalled(); // IMPORTANT: makes sure that it releases the lock
			expect(cacheService.get).toHaveBeenCalled(); // tries to find the result of the refresh, done by other call
		});
	});

	describe('revokeSession', () => {
		const tokenHash = 'hash';

		beforeEach(() => {
			jest.spyOn(sessionService as any, 'createSessionTokenHash').mockReturnValue(tokenHash);
		});

		it('should revoke the users session and remove from cache', async () => {
			// Arrange
			const sessionToken = 'token';

			// Act
			await sessionService.revokeSession(sessionToken);

			//Assert
			expect(prismaService.session.updateMany).toHaveBeenCalledWith({
				where: {
					token_hash: tokenHash,
					status: SessionStatus.Active,
				},
				data: {
					status: SessionStatus.Revoked,
				},
			});
			expect(cacheService.delete).toHaveBeenCalled();
		});
	});
});
