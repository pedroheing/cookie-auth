import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from 'src/app.module';
import request, { Response } from 'supertest';
import { clearDatabase } from 'test/helpers/clear-database';
import { flushRedis } from 'test/helpers/flush-redis';
import { AuthConfigService } from './config/auth-config.service';

describe('AuthController', () => {
	let app: INestApplication;
	let authConfigService: AuthConfigService;

	beforeAll(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = module.createNestApplication();
		app.use(cookieParser());
		app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true }));

		authConfigService = module.get(AuthConfigService);
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	afterEach(async () => {
		await clearDatabase();
		await flushRedis();
	});

	function checkIfCookieHasBeenSet(response: Response) {
		const cookie = response.headers['set-cookie'][0] as unknown as string;
		expect(cookie).toBeDefined();
		expect(cookie).toMatch(/HttpOnly/i);
		expect(cookie).toMatch(/SameSite=/i);
	}

	describe('POST /auth/sign-up', () => {
		it('should create account and set the cookie', async () => {
			const response = await request(app.getHttpServer()).post('/auth/sign-up').send({
				username: 'test123',
				password: 'password',
				firstName: 'test',
				lastName: 'abc',
			});

			expect(response.status).toBe(201);
			checkIfCookieHasBeenSet(response);
		});
	});

	describe('POST /auth/sign-in', () => {
		it('should be able to login with account', async () => {
			const dto = {
				username: 'test123',
				password: 'password',
				firstName: 'test',
				lastName: 'abc',
			};
			await request(app.getHttpServer()).post('/auth/sign-up').send(dto);

			const response = await request(app.getHttpServer()).post('/auth/sign-in').send({
				username: dto.username,
				password: dto.password,
			});

			expect(response.status).toBe(200);
			checkIfCookieHasBeenSet(response);
		});

		it('should be unable to login if it is already loged in', async () => {
			const dto = {
				username: 'test123',
				password: 'password',
				firstName: 'test',
				lastName: 'abc',
			};
			const agent = request.agent(app.getHttpServer());
			await agent.post('/auth/sign-up').send(dto);

			const response = await agent.post('/auth/sign-in').send({
				username: dto.username,
				password: dto.password,
			});

			expect(response.status).toBe(400);
		});
	});

	describe('POST /auth/sign-out', () => {
		it('should remove the cookie', async () => {
			const dto = {
				username: 'test123',
				password: 'password',
				firstName: 'test',
				lastName: 'abc',
			};
			const agent = request.agent(app.getHttpServer());
			await agent.post('/auth/sign-up').send(dto);

			const response = await agent.post('/auth/sign-out').send();

			expect(response.status).toBe(200);
			const cookie = response.headers['set-cookie'][0] as unknown as string[];
			expect(cookie).toBeDefined();
			expect(cookie).toMatch(new RegExp(`${authConfigService.cookie.name}=;`));
			expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
		});
	});
});
