export abstract class PasswordHashingService {
	abstract hash(password: string): Promise<string>;
	abstract verify(digest: string, password: string): Promise<boolean>;
}
