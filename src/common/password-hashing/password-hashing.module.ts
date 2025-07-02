import { Global, Module } from '@nestjs/common';
import { PasswordHashingService as PasswordHashingService } from './password-hashing.service';
import { Argon2Service } from './argon2/argon2';
import { PasswordHashingProvider } from './password-hashing-provider.interface';

const passwordHashService = {
	provide: PasswordHashingService,
	useFactory: (passwordHashingProvider: PasswordHashingProvider) => {
		return new PasswordHashingService(passwordHashingProvider);
	},
	inject: [Argon2Service],
};

@Global()
@Module({
	providers: [Argon2Service, passwordHashService],
	exports: [passwordHashService],
})
export class PasswordHashingModule {}
