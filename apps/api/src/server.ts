import { environment } from './config/environment.js';
import { buildApp } from './app.js';

const app = buildApp();

const start = async (): Promise<void> => {
  try {
    await app.listen({ host: environment.HOST, port: environment.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
