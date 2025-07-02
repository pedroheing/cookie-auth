import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.useGlobalPipes(
		new ValidationPipe({
			forbidNonWhitelisted: true,
		}),
	);
	app.use(cookieParser());
	app.use(helmet());
	app.setGlobalPrefix('/api/v1');
	await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
