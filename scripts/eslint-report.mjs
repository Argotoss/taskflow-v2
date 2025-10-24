import { ESLint } from 'eslint';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

async function main() {
	const eslint = new ESLint();
	const results = await eslint.lintFiles(['.']);
	const formatter = await eslint.loadFormatter('json');
	const output = formatter.format(results);
	await writeFile('lint-report.json', output, 'utf8');

	const hasErrors = results.some((result) => result.errorCount > 0);
	process.exit(hasErrors ? 1 : 0);
}

main().catch(async (error) => {
	const message = error instanceof Error ? error.stack ?? error.message : String(error);
	await writeFile('lint-report.error.log', message, 'utf8');
	process.exit(1);
});
