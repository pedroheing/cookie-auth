import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { RedisService } from 'src/common/redis/redis.service';
import { PasswordHashingService } from 'src/common/password-hashing/password-hashing.service';
import { authConfigRegistration } from 'src/config/auth.config';
import { DistributedLockService } from 'src/common/distributed-lock/distributed-lock.service';
import { SignUpDto } from './dto/sign-up.dto';
import { Prisma, SessionStatus } from '@prisma/client';
import { ConflictException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { addDays, addHours, sub, subHours } from 'date-fns';

const prismaServiceMock = {
	user: {
		create: jest.fn(),
		findUnique: jest.fn(),
		update: jest.fn(),
	},
	session: {
		create: jest.fn(),
		findUnique: jest.fn(),
		update: jest.fn(),
		updateMany: jest.fn(),
	},
	$transaction: jest.fn().mockImplementation(async (callback) => await callback(prismaServiceMock)),
};

const redisServiceMock = {
	set: jest.fn(),
	get: jest.fn(),
	expire: jest.fn(),
	setex: jest.fn(),
	unlink: jest.fn(),
	unlinkPattern: jest.fn(),
};

const passwordHashingServiceMock = {
	hash: jest.fn(),
	verify: jest.fn(),
};

const authConfigMock = {
	sessionLifespanInDays: 10,
	cacheLifespanInSeconds: 30,
	sessionTokenTTLInHours: 24,
	authSessionCacheTTLAterTokenRefreshInSeconds: 60,
	authSessionTokenRefreshedCacheTTLInSeconds: 60,
};

const lockMock = {
	release: jest.fn(),
};

const distributedLockServiceMock = {
	acquire: jest.fn().mockResolvedValue(lockMock),
};

describe('AuthService', () => {
	let authService: AuthService;
	let prismaService: typeof prismaServiceMock;
	let redisService: typeof redisServiceMock;
	let passwordHashService: typeof passwordHashingServiceMock;
	let distributedLockService: typeof distributedLockServiceMock;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: PrismaService, useValue: prismaServiceMock },
				{ provide: RedisService, useValue: redisServiceMock },
				{ provide: PasswordHashingService, useValue: passwordHashingServiceMock },
				{ provide: authConfigRegistration.KEY, useValue: authConfigMock },
				{ provide: DistributedLockService, useValue: distributedLockServiceMock },
			],
		}).compile();
		authService = module.get(AuthService);
		prismaService = module.get(PrismaService);
		redisService = module.get(RedisService);
		passwordHashService = module.get(PasswordHashingService);
		distributedLockService = module.get(DistributedLockService);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(authService).toBeDefined();
		expect(prismaService).toBeDefined();
		expect(redisService).toBeDefined();
		expect(passwordHashService).toBeDefined();
		expect(distributedLockService).toBeDefined();
	});

	describe('signUp', () => {
		const dto: SignUpDto = {
			firstName: 'test',
			lastName: '123',
			password: 'password',
			username: 'test123',
		};
		const hashedPassword = 'hashed-passwrod';

		it('should create a new user and return a session token', async () => {
			//Arrange
			const expectedToken = 'token';
			const user = { user_id: 1, ...dto };
			const session = { session_id: 1, user_id: 1, token_hash: 'any-hash' };

			passwordHashService.hash.mockResolvedValue(hashedPassword);
			prismaService.user.create.mockResolvedValue(user);
			prismaService.session.create.mockResolvedValue(session);
			jest.spyOn(authService as any, 'generateNewSessionToken').mockReturnValue(expectedToken);

			//Act
			const token = await authService.signUp(dto);

			//Assert
			expect(token).toBe(expectedToken);
			expect(passwordHashService.hash).toHaveBeenCalledWith(dto.password);
			expect(prismaService.$transaction).toHaveBeenCalled();
			expect(prismaService.user.create).toHaveBeenCalledWith({
				data: {
					first_name: dto.firstName,
					last_name: dto.lastName,
					username: dto.username,
					password: hashedPassword,
				},
			});
			expect(redisService.set).toHaveBeenCalled();
			expect(prismaService.session.create).toHaveBeenCalled();
		});

		it('should throw ConflictException if the username is in use', async () => {
			// Arrange
			const error = new Prisma.PrismaClientKnownRequestError('Error', {
				clientVersion: '',
				code: 'P2002',
			});
			prismaService.user.create.mockRejectedValue(error);
			passwordHashService.hash.mockResolvedValue(hashedPassword);

			// Act & Assert
			await expect(authService.signUp(dto)).rejects.toThrow(ConflictException);
		});

		it('should throw InternalServiceErrorException for unexpected db error', async () => {
			// Arrange
			const error = new Error('Generic Error');
			prismaService.user.create.mockRejectedValue(error);
			passwordHashService.hash.mockResolvedValue(hashedPassword);

			// Act & Assert
			await expect(authService.signUp(dto)).rejects.toBeInstanceOf(InternalServerErrorException);
		});
	});

	describe('signIn', () => {
		const password = 'password';
		const user = {
			password: 'hashed-password',
			user_id: 1,
			username: 'username',
		};

		it('should autenticate the user, create a session and return the token', async () => {
			// Arrange
			const expectedToken = 'token';
			const fakeSession = { session_id: 1, user_id: 1, token_hash: 'any-hash' };
			prismaService.user.findUnique.mockResolvedValue(user);
			passwordHashService.verify.mockResolvedValue(true);
			prismaService.session.create.mockResolvedValue(fakeSession);
			jest.spyOn(authService as any, 'generateNewSessionToken').mockReturnValue(expectedToken);

			// Act
			const token = await authService.signIn(user.username, password);

			// Assert
			expect(token).toBe(expectedToken);
			expect(redisService.set).toHaveBeenCalled();
			expect(passwordHashService.verify).toHaveBeenCalledWith(user.password, password);
			expect(prismaService.session.create).toHaveBeenCalled();
		});

		it('should throw UnauthorizedException when it does not find the user', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(null);
			passwordHashService.hash.mockResolvedValue('dummy-hashed-password');
			// makes sure that it fails because it doesn't find a user, not because the password is wrong
			passwordHashService.verify.mockResolvedValue(true);

			// Act && Assert
			await expect(authService.signIn('username', 'password')).rejects.toThrow(UnauthorizedException);
			// it should verify the password even if the user doesn't exist, to prevent timing attacks
			expect(passwordHashService.verify).toHaveBeenCalled();
		});

		it('should throw UnauthorizedException when the password does not match', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(user);
			passwordHashService.verify.mockResolvedValue(false);

			// Act && Assert
			await expect(authService.signIn(user.username, password)).rejects.toThrow(UnauthorizedException);
			expect(passwordHashService.verify).toHaveBeenCalledWith(user.password, password);
		});
	});

	describe('signOut', () => {
		it('should revoke the users session and remove from cache', async () => {
			// Arrange
			const sessioToken = 'token';
			const tokenHash = 'hash';
			const session = {
				status: SessionStatus.Active,
				token_hash: '',
				user_id: 1,
			};
			prismaService.session.findUnique.mockResolvedValue(session);
			jest.spyOn(authService as any, 'getSessionTokenHash').mockReturnValue(tokenHash);

			// Act
			await authService.signOut(sessioToken);

			//Assert
			expect(prismaService.session.findUnique).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { token_hash: tokenHash },
				}),
			);
			expect(redisService.unlink).toHaveBeenCalled();
			expect(prismaService.session.update).toHaveBeenCalledWith({
				where: {
					token_hash: tokenHash,
					status: SessionStatus.Active,
				},
				data: {
					status: SessionStatus.Revoked,
				},
			});
		});

		it('should do nothing if the session was not found', async () => {
			// Arrange
			const tokenHash = 'hash';
			prismaService.session.findUnique.mockResolvedValue(null);
			jest.spyOn(authService as any, 'getSessionTokenHash').mockReturnValue(tokenHash);

			// Act
			await authService.signOut('token');

			//Assert
			expect(prismaService.session.findUnique).toHaveBeenCalledWith({
				where: { token_hash: tokenHash },
				select: expect.any(Object),
			});
			expect(redisService.unlink).not.toHaveBeenCalled();
			expect(prismaService.session.update).not.toHaveBeenCalled();
		});

		it('should do nothing if the session has the revoked status', async () => {
			// Arrange
			const tokenHash = 'hash';
			const session = {
				status: SessionStatus.Revoked,
				token_hash: tokenHash,
				user_id: 1,
			};
			prismaService.session.findUnique.mockResolvedValue(session);
			jest.spyOn(authService as any, 'getSessionTokenHash').mockReturnValue(tokenHash);

			// Act
			await authService.signOut('token');

			//Assert
			expect(prismaService.session.findUnique).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { token_hash: tokenHash },
				}),
			);
			expect(redisService.unlink).not.toHaveBeenCalled();
			expect(prismaService.session.update).not.toHaveBeenCalled();
		});
	});

	describe('changePassword', () => {
		const changePasswordDto = {
			userId: 1,
			sessionToken: 'current-valid-token',
			currentPassword: 'password',
			newPassword: 'newPassword',
		};
		const userFromDb = {
			user_id: 1,
			password: 'passwordHash',
		};
		const hashNewPassword = 'hashNewPassword';
		const currentTokenHash = 'tokenHash';

		beforeEach(() => {
			jest.spyOn(authService as any, 'getSessionTokenHash').mockReturnValue(currentTokenHash);
		});

		it('should change the user password and revoke other sessions from database and remove from the cache', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(userFromDb);
			passwordHashService.verify.mockResolvedValue(true);
			passwordHashService.hash.mockResolvedValue(hashNewPassword);

			// Act
			await authService.changePassword(changePasswordDto);

			// Assert
			expect(prismaService.user.findUnique).toHaveBeenCalled();
			expect(passwordHashService.verify).toHaveBeenCalledWith(userFromDb.password, changePasswordDto.currentPassword);
			expect(passwordHashService.hash).toHaveBeenCalledWith(changePasswordDto.newPassword);
			expect(prismaService.$transaction).toHaveBeenCalled();
			expect(prismaService.user.update).toHaveBeenCalledWith({
				where: {
					user_id: userFromDb.user_id,
				},
				data: {
					password: hashNewPassword,
				},
			});
			expect(prismaService.session.updateMany).toHaveBeenCalledWith({
				where: {
					user_id: userFromDb.user_id,
					NOT: {
						token_hash: currentTokenHash,
					},
				},
				data: {
					status: SessionStatus.Revoked,
				},
			});
			expect(redisService.unlinkPattern).toHaveBeenCalled();
		});

		it('should throw NotFoundException when the user is not found', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(null);

			// Act && Assert
			await expect(authService.changePassword(changePasswordDto)).rejects.toThrow(NotFoundException);
		});

		it('should throw UnauthorizedException when passing the wrong password', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(userFromDb);
			passwordHashService.verify.mockResolvedValue(false);

			// Act && Assert
			await expect(authService.changePassword(changePasswordDto)).rejects.toThrow(UnauthorizedException);
			expect(passwordHashService.verify).toHaveBeenCalledWith(userFromDb.password, changePasswordDto.currentPassword);
		});

		it('should throw InternalServerErrorException when the transaction fails', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(userFromDb);
			passwordHashService.verify.mockResolvedValue(true);
			prismaService.user.update.mockRejectedValue(new Error('DB transaction failed'));

			// Act && Assert
			await expect(authService.changePassword(changePasswordDto)).rejects.toThrow(InternalServerErrorException);
			expect(prismaService.$transaction).toHaveBeenCalled();
		});
	});

	describe('validateSession', () => {
		const currentTokenHash = 'tokenHash';

		beforeEach(() => {
			jest.spyOn(authService as any, 'getSessionTokenHash').mockReturnValue(currentTokenHash);
		});

		it('should validate the session and return the user_id', async () => {
			// Arrange
			const session = {
				status: SessionStatus.Active,
				expires_at: addHours(new Date(), 10),
				last_token_issued_at: new Date(),
				user_id: 1,
			};
			jest.spyOn(authService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);

			// Act
			const result = await authService.validateSession('session-token');

			// Assert
			expect(result).toEqual({ userId: session.user_id });
		});

		test.each([SessionStatus.Revoked, SessionStatus.Expired])('should return null for session with %s status', async (status) => {
			// Arrange
			const session = {
				status: status,
			};
			jest.spyOn(authService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);

			// Act
			const result = await authService.validateSession('session-token');

			// Assert
			expect(result).toBe(null);
		});

		it('should return null for non-existent session', async () => {
			// Arrange
			jest.spyOn(authService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(null);

			// Act
			const result = await authService.validateSession('session-token');

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
			jest.spyOn(authService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);

			// Act
			const result = await authService.validateSession('session-token');

			// Assert
			expect(result).toBe(null);
		});

		it('should refresh expired token and return new session token', async () => {
			// Arrange
			const session = {
				status: SessionStatus.Active,
				expires_at: addHours(new Date(), 1),
				last_token_issued_at: subHours(new Date(), authConfigMock.sessionTokenTTLInHours + 1),
				user_id: 1,
			};
			const newSessionToken = 'new-session-token';
			const refreshedSession = {
				status: SessionStatus.Active,
				expires_at: addDays(new Date(), authConfigMock.sessionLifespanInDays),
				last_token_issued_at: new Date(),
				user_id: 1,
			};
			jest.spyOn(authService as any, 'getSessionFromCacheOrDatabase').mockReturnValue(session);
			jest.spyOn(authService as any, 'generateNewSessionToken').mockReturnValue(newSessionToken);
			redisService.get.mockResolvedValue(null); // no refresh done, is the winner
			prismaService.session.update.mockResolvedValue(refreshedSession);

			// Act
			const result = await authService.validateSession('session-token');

			// Assert
			expect(result).toEqual({ userId: session.user_id, newSessionToken: newSessionToken });
			expect(distributedLockService.acquire).toHaveBeenCalled(); // makes sure that it uses a concurrent lock
			expect(lockMock.release).toHaveBeenCalled(); // IMPORTANT: makes sure that it releases the lock
			expect(prismaService.session.update).toHaveBeenCalled(); // updates the session with new token and expiration dates
			expect(redisService.get).toHaveBeenCalled(); // tries to find the result of the refresh, done by other call
			expect(redisService.set).toHaveBeenCalled(); // sets the new session to the cache
			expect(redisService.expire).toHaveBeenCalled(); // defines expiration date for the old session, so concurrent calls don't fail instantly
			expect(redisService.setex).toHaveBeenCalled(); // sets the result of the refresh
		});

		it('should use the result of refresh token in concurrent call', async () => {
			// Arrange
			const session = {
				status: SessionStatus.Active,
				expires_at: addHours(new Date(), 1),
				last_token_issued_at: subHours(new Date(), authConfigMock.sessionTokenTTLInHours + 1),
				user_id: 1,
			};
			const newSessionTokenhash = 'new-session-token-hash';
			const refreshedSession = {
				status: SessionStatus.Active,
				expires_at: addDays(new Date(), authConfigMock.sessionLifespanInDays),
				last_token_issued_at: new Date(),
				user_id: 1,
			};
			jest.spyOn(authService as any, 'getSessionFromCacheOrDatabase').mockReturnValueOnce(session); // old Session
			redisService.get.mockResolvedValue(newSessionTokenhash); // the token refresh was done by other call
			jest.spyOn(authService as any, 'getSessionFromCacheOrDatabase').mockReturnValueOnce(refreshedSession); // new Session

			// Act
			const result = await authService.validateSession('session-token');

			// Assert
			expect(result).toEqual({ userId: session.user_id });
			expect(distributedLockService.acquire).toHaveBeenCalled(); // makes sure that it uses a concurrent lock
			expect(lockMock.release).toHaveBeenCalled(); // IMPORTANT: makes sure that it releases the lock
			expect(redisService.get).toHaveBeenCalled(); // tries to find the result of the refresh, done by other call
		});
	});
});
