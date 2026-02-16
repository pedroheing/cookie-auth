import * as argon2 from 'argon2';
import { PasswordHashingService } from '../password-hashing.interface';

export class Argon2Service implements PasswordHashingService {
	hash(password: string): Promise<string> {
		return argon2.hash(password);
	}

	verify(digest: string, password: string): Promise<boolean> {
		return argon2.verify(digest, password);
	}
}
