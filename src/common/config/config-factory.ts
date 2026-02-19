import { plainToClass } from 'class-transformer';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { validateSync } from 'class-validator';

export enum Environment {
	Development = 'development',
	Production = 'production',
}

export type ConfigClass<V> = new (config: V) => any;

function validateEnv<T extends object>(cls: ClassConstructor<T>): T {
	const env = plainToClass(cls, process.env, {
		enableImplicitConversion: true,
	});
	const errors = validateSync(env, { skipMissingProperties: false });
	if (errors.length > 0) {
		const messages = errors.map((e) => Object.values(e.constraints || {}).join(', ')).join('; ');
		throw new Error(`Config Validation Error (${cls.name}): ${messages}`);
	}
	return env;
}

export function createEnvProvider<T extends object>(envVariablesClass: ClassConstructor<T>) {
	return {
		provide: envVariablesClass,
		useFactory: () => validateEnv(envVariablesClass),
	};
}
