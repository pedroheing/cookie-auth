import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { registerAs } from '@nestjs/config';

export enum Environment {
	Development = 'development',
	Production = 'production',
}

export type ConfigClass<V> = new (config: V) => any;

function validateConfig<V>(envVariablesClass: ClassConstructor<V>): V {
	const validatedConfig = plainToClass(envVariablesClass, process.env, { enableImplicitConversion: true }) as object as V;
	const errors = validateSync(validatedConfig as object, { skipMissingProperties: false });

	if (errors.length > 0) {
		throw new Error(errors.toString());
	}
	return validatedConfig;
}

export function createConfigRegistration<V>(configKey: string, ConfigClass: ConfigClass<V>, envVariablesClass: ClassConstructor<V>) {
	return registerAs(configKey, () => {
		const config = validateConfig(envVariablesClass);
		return new ConfigClass(config);
	});
}
