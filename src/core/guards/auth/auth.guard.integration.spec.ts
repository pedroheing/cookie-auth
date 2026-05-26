import { Controller, Get, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { addHours } from 'date-fns';
import { AppModule } from 'src/app.module';
import { AuthConfigService } from 'src/features/auth/config/auth-config.service';
import request, { Response } from 'supertest';
import { clearDatabase } from 'test/helpers/clear-database';
import { flushRedis } from 'test/helpers/flush-redis';

@Controller('__test__')
class TestController {
	@Get()
	ping() {
		return { ok: true };
	}
}

describe('AuthGuard', () => {
	let app: INestApplication;
	let authConfigService: AuthConfigService;

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [AppModule],
			controllers: [TestController],
		}).compile();

		app = module.createNestApplication();
		authConfigService = module.get(AuthConfigService);
		app.use(cookieParser());
		app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true }));
		await app.init();
	});

	afterAll(() => app.close());

	afterEach(async () => {
		jest.useRealTimers();
		await clearDatabase();
		await flushRedis();
	});

	async function signUp() {
		const agent = request.agent(app.getHttpServer());
		await agent.post('/auth/sign-up').send({
			username: `user_${Date.now()}`,
			password: 'password',
			firstName: 'Test',
			lastName: 'User',
		});
		return agent;
	}

	function expectCookieToBeAdded(response: Response) {
		const cookie = response.headers['set-cookie'][0] as unknown as string;
		expect(cookie).toBeDefined();
		expect(cookie).toMatch(/HttpOnly/i);
		expect(cookie).toMatch(/SameSite=/i);
	}

	function expectCookieToBeRemoved(response: Response) {
		expect(response.headers['set-cookie']?.[0]).toMatch(new RegExp(`${authConfigService.cookie.name}=;`));
	}

	it('should return 401 and clear the cookie when no cookie is sent', async () => {
		const response = await request(app.getHttpServer()).get('/__test__');

		expect(response.status).toBe(401);
		expectCookieToBeRemoved(response);
	});

	it('should allow the request when session is valid', async () => {
		const agent = await signUp();

		const response = await agent.get('/__test__');

		expect(response.status).toBe(200);
	});

	it('should return 401 and clear the cookie when session is revoked', async () => {
		const agent = await signUp();
		await agent.post('/auth/sign-out');
		const response = await agent.get('/__test__');

		expect(response.status).toBe(401);
		expectCookieToBeRemoved(response);
	});

	it('should set a new cookie when the token is expired', async () => {
		const agent = await signUp();
		const authConfigService = app.get(AuthConfigService);
		jest.useFakeTimers().setSystemTime(addHours(new Date(), authConfigService.sessionTokenTTLInHours + 1));

		const response = await agent.get('/__test__');

		expect(response.status).toBe(200);
		expectCookieToBeAdded(response);
	});
});
