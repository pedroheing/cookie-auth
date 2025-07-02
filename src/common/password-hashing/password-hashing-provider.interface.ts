export interface PasswordHashingProvider {
	hash(password: string): Promise<string>;
	verify(digest: string, password: string): Promise<boolean>;
}
