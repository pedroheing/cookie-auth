import { Module } from '@nestjs/common';
import { CacheModule } from 'src/common/cache/cache.module';
import { createEnvProvider } from 'src/common/config/config-factory';
import { DistributedLockModule } from 'src/common/distributed-lock/distributed-lock.module';
import { PasswordHashingModule } from 'src/common/password-hashing/password-hashing.module';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthConfigService } from './config/auth-config.service';
import { AuthEnv } from './config/auth.env';
import { SessionService } from './session/session.service';

@Module({
	imports: [PrismaModule, CacheModule, PasswordHashingModule, DistributedLockModule, UserModule],
	providers: [AuthService, createEnvProvider(AuthEnv), AuthConfigService, SessionService],
	controllers: [AuthController],
	exports: [AuthService, AuthConfigService, SessionService],
})
export class AuthModule {}
