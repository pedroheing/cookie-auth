import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { SignUpDto } from './dto/sign-up.dto';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { mock, mockDeep } from 'jest-mock-extended';
import { PasswordHashingService } from 'src/common/password-hashing/password-hashing.interface';
import { SessionService } from './session/session.service';
import { UserService } from '../user/user.service';

describe('AuthService', () => {
	let authService: AuthService;
	const prismaService = mockDeep<PrismaService>();
	const sessionService = mock<SessionService>();
	const userService = mock<UserService>();
	const passwordHashService = mock<PasswordHashingService>();

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: PrismaService, useValue: prismaService },
				{ provide: PasswordHashingService, useValue: passwordHashService },
				{ provide: SessionService, useValue: sessionService },
				{ provide: UserService, useValue: userService },
			],
		}).compile();
		authService = module.get(AuthService);
		prismaService.$transaction.mockImplementation(async (callback) => await callback(prismaService));
	});

	it('should be defined', () => {
		expect(authService).toBeDefined();
		expect(prismaService).toBeDefined();
		expect(passwordHashService).toBeDefined();
		expect(sessionService).toBeDefined();
		expect(userService).toBeDefined();
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
			userService.create.mockResolvedValue(user as any);
			sessionService.create.mockResolvedValue({ session: session as any, sessionToken: expectedToken });

			//Act
			const token = await authService.signUp(dto);

			//Assert
			expect(token).toBe(expectedToken);
			expect(passwordHashService.hash).toHaveBeenCalledWith(dto.password);
			expect(prismaService.$transaction).toHaveBeenCalled();
			expect(userService.create).toHaveBeenCalledWith({
				firstName: dto.firstName,
				lastName: dto.lastName,
				hashedPassword: hashedPassword,
				username: dto.username,
			});
			expect(sessionService.create).toHaveBeenCalled();
			expect(sessionService.addSessionToCache).toHaveBeenCalled();
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
			prismaService.user.findUnique.mockResolvedValue(user as any);
			passwordHashService.verify.mockResolvedValue(true);
			sessionService.create.mockResolvedValue({ sessionToken: expectedToken, session: fakeSession as any });

			// Act
			const token = await authService.signIn(user.username, password);

			// Assert
			expect(token).toBe(expectedToken);
			expect(passwordHashService.verify).toHaveBeenCalledWith(user.password, password);
			expect(sessionService.create).toHaveBeenCalledWith(user.user_id);
			expect(sessionService.addSessionToCache).toHaveBeenCalledWith(fakeSession);
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
			prismaService.user.findUnique.mockResolvedValue(user as any);
			passwordHashService.verify.mockResolvedValue(false);

			// Act && Assert
			await expect(authService.signIn(user.username, password)).rejects.toThrow(UnauthorizedException);
			expect(passwordHashService.verify).toHaveBeenCalledWith(user.password, password);
		});
	});

	describe('signOut', () => {
		it('should call the SessionService to revoke the session', async () => {
			// Arrange
			const sessionToken = 'token';

			// Act
			await authService.signOut(sessionToken);

			//Assert
			expect(sessionService.revokeSession).toHaveBeenCalledWith(sessionToken);
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

		it('should change the user password and revoke other sessions from database and remove from the cache', async () => {
			// Arrange
			const mockSessions = [
				{ session_id: 1, token_hash: 'hash1' },
				{ session_id: 2, token_hash: 'hash2' },
			];
			const expectedHashes = mockSessions.map((s) => s.token_hash);

			prismaService.user.findUnique.mockResolvedValue(userFromDb as any);
			prismaService.session.findMany.mockResolvedValue(mockSessions as any);
			passwordHashService.verify.mockResolvedValue(true);
			passwordHashService.hash.mockResolvedValue(hashNewPassword);
			sessionService.revokeAllBut.mockResolvedValue(expectedHashes);

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
			expect(sessionService.revokeAllBut).toHaveBeenCalledWith(userFromDb.user_id, changePasswordDto.sessionToken, prismaService);
			expect(sessionService.removeSessionFromCache).toHaveBeenCalledWith(expectedHashes);
		});

		it('should throw NotFoundException when the user is not found', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(null);

			// Act && Assert
			await expect(authService.changePassword(changePasswordDto)).rejects.toThrow(NotFoundException);
		});

		it('should throw ForbiddenException when passing the wrong password', async () => {
			// Arrange
			prismaService.user.findUnique.mockResolvedValue(userFromDb as any);
			passwordHashService.verify.mockResolvedValue(false);

			// Act && Assert
			await expect(authService.changePassword(changePasswordDto)).rejects.toThrow(ForbiddenException);
			expect(passwordHashService.verify).toHaveBeenCalledWith(userFromDb.password, changePasswordDto.currentPassword);
		});
	});
});
