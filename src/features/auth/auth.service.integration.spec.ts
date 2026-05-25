import { ForbiddenException, INestApplication, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { clearDatabase } from 'test/helpers/clear-database';
import { flushRedis } from 'test/helpers/flush-redis';
import { UserService } from '../user/user.service';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SessionService } from './session/session.service';

describe('AuthService', () => {
	let app: INestApplication;
	let authService: AuthService;
	let sessionService: SessionService;
	let userService: UserService;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			imports: [AuthModule],
		}).compile();
		app = module.createNestApplication();
		await app.init();
		authService = module.get(AuthService);
		sessionService = module.get(SessionService);
		userService = module.get(UserService);
	});

	it('should be defined', () => {
		expect(authService).toBeDefined();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await clearDatabase();
		await flushRedis();
	});

	describe('signUp', () => {
		it('should create a new user and return a session token', async () => {
			const dto: SignUpDto = {
				firstName: 'test',
				lastName: '123',
				password: 'password',
				username: 'test123',
			};

			const token = await authService.signUp(dto);

			const user = await userService.findByUsername(dto.username);
			const session = await sessionService.validateAndRefreshSession(token);
			expect(token).toBeTruthy();
			expect(session.isValid).toBe(true);
			expect(user).toBeTruthy();
			expect(user?.password).not.toBe(dto.password);
		});
	});

	describe('signIn', () => {
		const signUpDto: SignUpDto = {
			firstName: 'test',
			lastName: '123',
			password: 'password',
			username: 'test123',
		};

		it('should autenticate the user, create a session and return the token', async () => {
			await authService.signUp(signUpDto);

			const token = await authService.signIn(signUpDto.username, signUpDto.password);

			const session = await sessionService.validateAndRefreshSession(token);
			expect(token).toBeTruthy();
			expect(session.isValid).toBe(true);
		});

		it('should throw UnauthorizedException when it does not find the user', async () => {
			await expect(authService.signIn('test', 'password')).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when the password does not match', async () => {
			await authService.signUp(signUpDto);

			await expect(authService.signIn(signUpDto.username, 'other-password')).rejects.toThrow(UnauthorizedException);
		});
	});

	describe('signOut', () => {
		it('should revoke the session', async () => {
			const dto: SignUpDto = {
				firstName: 'test',
				lastName: '123',
				password: 'password',
				username: 'test123',
			};
			const token = await authService.signUp(dto);

			await authService.signOut(token);

			const session = await sessionService.validateAndRefreshSession(token);
			expect(session.isValid).toBe(false);
		});
	});

	describe('changePassword', () => {
		const dto: SignUpDto = {
			firstName: 'test',
			lastName: '123',
			password: 'password',
			username: 'test123',
		};

		it('should change the user password and revoke other sessions', async () => {
			const tokenFirstSession = await authService.signUp(dto);
			const tokenSecondSession = await authService.signIn(dto.username, dto.password);
			const tokenThirdSession = await authService.signIn(dto.username, dto.password);
			const user = await userService.findByUsername(dto.username);

			await authService.changePassword({
				currentPassword: dto.password,
				newPassword: 'test',
				sessionToken: tokenFirstSession,
				userId: user!.user_id,
			});

			const results = await Promise.all([
				sessionService.validateAndRefreshSession(tokenFirstSession),
				sessionService.validateAndRefreshSession(tokenSecondSession),
				sessionService.validateAndRefreshSession(tokenThirdSession),
			]);
			expect(results[0]).toEqual({ isValid: true, userId: user!.user_id });
			expect(results[1]).toEqual({ isValid: false });
			expect(results[2]).toEqual({ isValid: false });
		});

		it('should throw NotFoundException when the user is not found', async () => {
			await expect(
				authService.changePassword({
					currentPassword: 'test1',
					newPassword: 'test2',
					sessionToken: 'abc',
					userId: 1,
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('should throw ForbiddenException when passing the wrong password', async () => {
			const token = await authService.signUp(dto);
			const user = await userService.findByUsername(dto.username);

			await expect(
				authService.changePassword({
					currentPassword: 'wrong-password',
					newPassword: 'test',
					sessionToken: token,
					userId: user!.user_id,
				}),
			).rejects.toThrow(ForbiddenException);
		});
	});
});
