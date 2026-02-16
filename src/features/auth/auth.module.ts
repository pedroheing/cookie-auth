import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { createEnvProvider } from 'src/common/config/config-factory';
import { AuthEnv } from './config/auth.env';
import { AuthConfigService } from './config/auth-config.service';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { CacheModule } from 'src/common/cache/cache.module';
import { PasswordHashingModule } from 'src/common/password-hashing/password-hashing.module';
import { DistributedLockModule } from 'src/common/distributed-lock/distributed-lock.module';
import { SessionService } from './session/session.service';
import { UserModule } from '../user/user.module';

@Module({
	imports: [PrismaModule, CacheModule, PasswordHashingModule, DistributedLockModule, UserModule],
	providers: [AuthService, createEnvProvider(AuthEnv), AuthConfigService, SessionService],
	controllers: [AuthController],
	exports: [AuthService, AuthConfigService, SessionService],
})
export class AuthModule {}
