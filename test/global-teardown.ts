export default async () => {
	console.log('\n[Global Teardown] Stopping containers...');

	await Promise.all([(global as any).__PG_CONTAINER__?.stop(), (global as any).__REDIS_CONTAINER__?.stop()]);
};
