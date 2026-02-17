import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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

	const config = new DocumentBuilder().setTitle('Cookie Auth API').setDescription('The Authentication API description').setVersion('1.0').build();
	const documentFactory = () => SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('api/docs', app, documentFactory);

	await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
