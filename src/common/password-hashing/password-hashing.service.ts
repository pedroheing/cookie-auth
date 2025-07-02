import { PasswordHashingProvider } from './password-hashing-provider.interface';

export class PasswordHashingService {
	constructor(private readonly hashingProvider: PasswordHashingProvider) {}

	hash(password: string): Promise<string> {
		return this.hashingProvider.hash(password);
	}

	verify(digest: string, password: string): Promise<boolean> {
		return this.hashingProvider.verify(digest, password);
	}
}
