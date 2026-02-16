import { Module } from '@nestjs/common';
import { PasswordHashingService } from './password-hashing.interface';
import { Argon2Service } from './providers/argon2';

@Module({
	providers: [
		{
			provide: PasswordHashingService,
			useClass: Argon2Service,
		},
	],
	exports: [PasswordHashingService],
})
export class PasswordHashingModule {}
