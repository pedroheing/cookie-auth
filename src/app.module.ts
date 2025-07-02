import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './features/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import authConfig from './config/auth.config';
import { PasswordHashingModule } from './common/password-hashing/password-hashing.module';
import redisConfig from './config/redis.config';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [authConfig, redisConfig],
		}),
		RedisModule,
		PrismaModule,
		PasswordHashingModule,
		AuthModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
