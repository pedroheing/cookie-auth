import { PasswordHashingProvider } from '../password-hashing-provider.interface';
import * as argon2 from 'argon2';

export class Argon2Service implements PasswordHashingProvider {
	hash(password: string): Promise<string> {
		return argon2.hash(password);
	}

	verify(digest: string, password: string): Promise<boolean> {
		return argon2.verify(digest, password);
	}
}
