import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './features/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { PasswordHashingModule } from './common/password-hashing/password-hashing.module';
import { redisConfigRegistration } from './config/redis.config';
import { authConfigRegistration } from './config/auth.config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './core/guards/auth.guard';
import { PostModule } from './features/post/post.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [authConfigRegistration, redisConfigRegistration],
		}),
		RedisModule,
		PrismaModule,
		PasswordHashingModule,
		AuthModule,
		PostModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
	],
})
export class AppModule {}
