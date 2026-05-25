import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addDays, addHours } from 'date-fns';
import { CacheModule } from 'src/common/cache/cache.module';
import { createEnvProvider } from 'src/common/config/config-factory';
import { DistributedLockModule } from 'src/common/distributed-lock/distributed-lock.module';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { clearDatabase, getPrisma } from '../../../../test/helpers/clear-database';
import { flushRedis } from '../../../../test/helpers/flush-redis';
import { AuthConfigService } from '../config/auth-config.service';
import { AuthEnv } from '../config/auth.env';
import { SessionService } from './session.service';

describe('SessionService', () => {
	let app: INestApplication;
	let sessionService: SessionService;
	let authConfigService: AuthConfigService;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [PrismaModule, CacheModule, DistributedLockModule],
			providers: [SessionService, createEnvProvider(AuthEnv), AuthConfigService],
		}).compile();
		app = moduleRef.createNestApplication();
		await app.init();
		sessionService = moduleRef.get(SessionService);
		authConfigService = moduleRef.get(AuthConfigService);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await clearDatabase();
		await flushRedis();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	async function createUser() {
		return getPrisma().user.create({
			data: {
				first_name: 'Test',
				last_name: 'User',
				username: `user_${Date.now()}`,
				password: 'hashed_password',
			},
		});
	}

	describe('create', () => {
		it('should create a valid session', async () => {
			const user = await createUser();

			const currentSession = await sessionService.create(user.user_id);

			const result = await sessionService.validateAndRefreshSession(currentSession.sessionToken);
			expect(result).toEqual({ isValid: true, userId: user.user_id });
		});
	});

	describe('validateAndRefreshSession', () => {
		it('should return isValid: true to a valid session', async () => {
			const user = await createUser();
			const currentSession = await sessionService.create(user.user_id);

			const result = await sessionService.validateAndRefreshSession(currentSession.sessionToken);

			expect(result).toEqual({ isValid: true, userId: user.user_id });
		});

		it('should return isValid: false for a non-existant session', async () => {
			const result = await sessionService.validateAndRefreshSession('invalid-token');

			expect(result).toEqual({ isValid: false });
		});

		it('should renew expired token', async () => {
			const user = await createUser();
			const currentSession = await sessionService.create(user.user_id);
			const timeAfterTokenExpiration = addHours(new Date(), authConfigService.sessionTokenTTLInHours + 1);
			jest.useFakeTimers().setSystemTime(timeAfterTokenExpiration);

			const result = await sessionService.validateAndRefreshSession(currentSession.sessionToken);

			expect(result.isValid).toBe(true);
			expect(result.userId).toBe(user.user_id);
			expect(result.newSessionToken).toBeTruthy();
			expect(result.newSessionToken).not.toBe(currentSession.sessionToken);
		});

		it('should resturn isValid: false for revoked session', async () => {
			const user = await createUser();
			const currentSession = await sessionService.create(user.user_id);
			await sessionService.revokeSession(currentSession.sessionToken);

			const result = await sessionService.validateAndRefreshSession(currentSession.sessionToken);

			expect(result).toEqual({ isValid: false });
		});

		it('should resturn isValid: false for expired session', async () => {
			const user = await createUser();
			const currentSession = await sessionService.create(user.user_id);
			const timeAfterTokenExpiration = addDays(new Date(), authConfigService.sessionLifespanInDays + 1);
			jest.useFakeTimers().setSystemTime(timeAfterTokenExpiration);

			const result = await sessionService.validateAndRefreshSession(currentSession.sessionToken);

			expect(result).toEqual({ isValid: false });
		});

		it('should renew the token only once in a concurrent call', async () => {
			const user = await createUser();
			const currentSession = await sessionService.create(user.user_id);
			const timeAfterTokenExpiration = addHours(new Date(), authConfigService.sessionTokenTTLInHours + 1);
			jest.useFakeTimers().setSystemTime(timeAfterTokenExpiration);

			const results = await Promise.all([
				sessionService.validateAndRefreshSession(currentSession.sessionToken),
				sessionService.validateAndRefreshSession(currentSession.sessionToken),
				sessionService.validateAndRefreshSession(currentSession.sessionToken),
			]);

			const winner = results.find((r) => r.newSessionToken);
			const bystanders = results.filter((r) => !r.newSessionToken);
			expect(winner).toBeTruthy();
			expect(winner?.isValid).toBe(true);
			expect(winner?.userId).toBe(user.user_id);
			expect(winner?.newSessionToken).not.toBe(currentSession.sessionToken);
			expect(bystanders).toHaveLength(2);
			for (const passenger of bystanders) {
				expect(passenger).toEqual({ isValid: true, userId: user.user_id });
			}
		});
	});

	describe('revokeSession', () => {
		it('should revoke the session', async () => {
			const user = await createUser();
			const currentSession = await sessionService.create(user.user_id);

			await sessionService.revokeSession(currentSession.sessionToken);

			const result = await sessionService.validateAndRefreshSession(currentSession.sessionToken);
			expect(result).toEqual({ isValid: false });
		});
	});

	describe('revokeOtherSessions', () => {
		it('should revoke all other sessions from the user', async () => {
			const user = await createUser();
			const firstSession = await sessionService.create(user.user_id);
			const secondSession = await sessionService.create(user.user_id);
			const currentSession = await sessionService.create(user.user_id);

			await sessionService.revokeOtherSessions(user.user_id, currentSession.sessionToken);

			const results = await Promise.all([
				sessionService.validateAndRefreshSession(firstSession.sessionToken),
				sessionService.validateAndRefreshSession(secondSession.sessionToken),
				sessionService.validateAndRefreshSession(currentSession.sessionToken),
			]);
			expect(results[0]).toEqual({ isValid: false });
			expect(results[1]).toEqual({ isValid: false });
			expect(results[2]).toEqual({ isValid: true, userId: user.user_id });
		});

		it('should only revoke sessions from the same user', async () => {
			const userA = await createUser();
			const userB = await createUser();
			const firstSessionUserA = await sessionService.create(userA.user_id);
			const currentSessionUserA = await sessionService.create(userA.user_id);
			const sessionUserB = await sessionService.create(userB.user_id);

			await sessionService.revokeOtherSessions(userA.user_id, currentSessionUserA.sessionToken);

			const results = await Promise.all([
				sessionService.validateAndRefreshSession(firstSessionUserA.sessionToken),
				sessionService.validateAndRefreshSession(currentSessionUserA.sessionToken),
				sessionService.validateAndRefreshSession(sessionUserB.sessionToken),
			]);
			expect(results[0]).toEqual({ isValid: false });
			expect(results[1]).toEqual({ isValid: true, userId: userA.user_id });
			expect(results[2]).toEqual({ isValid: true, userId: userB.user_id });
		});
	});
});
