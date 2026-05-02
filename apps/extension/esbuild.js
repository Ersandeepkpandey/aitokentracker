const esbuild = require('esbuild');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    minify: isProduction,
    sourcemap: !isProduction,
    define: {
      'process.env.API_BASE': JSON.stringify(
        isProduction ? 'https://api.aitokentracker.com' : 'http://localhost:3001'
      ),
      'process.env.APP_BASE': JSON.stringify(
        isProduction ? 'https://aitokentracker.com' : 'http://localhost:3000'
      ),
    },
  });

  if (isWatch) {
    await ctx.watch();
    console.log('Watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
