// build.js
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

// CORRECTED obfuscation configuration
const OBFUSCATE_CONFIG = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  debugProtectionInterval: 0, // ✅ Fixed: must be a number >= 0
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.5,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 5,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 5,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

async function build() {
  console.log('🚀 Building HRMD Application with Obfuscation...');
  console.log('='.repeat(50));
  console.log('');

  // 1. Clean existing dist folder
  console.log('🧹 Cleaning dist folder...');
  await fs.remove('dist');
  await fs.ensureDir('dist');
  console.log('✅ Clean complete');
  console.log('');

  // 2. Copy non-JS files
  console.log('📦 Copying non-JS files...');

  // Copy folders that don't need obfuscation
  const foldersToCopy = ['views', 'public', 'uploads'];
  for (const folder of foldersToCopy) {
    if (await fs.pathExists(folder)) {
      await fs.copy(folder, `dist/${folder}`);
      console.log(`  ✓ Copied ${folder}/`);
    }
  }

  // Copy config folder (keep non-JS files, obfuscate JS files)
  if (await fs.pathExists('config')) {
    const files = await fs.readdir('config');
    await fs.ensureDir('dist/config');

    for (const file of files) {
      const sourcePath = path.join('config', file);
      const destPath = path.join('dist/config', file);

      if (file.endsWith('.js')) {
        await obfuscateFile(sourcePath, destPath);
        console.log(`  ✓ Obfuscated config/${file}`);
      } else {
        await fs.copy(sourcePath, destPath);
        console.log(`  ✓ Copied config/${file}`);
      }
    }
  }

  console.log('✅ Non-JS files copied');
  console.log('');

  // 3. Obfuscate JavaScript files
  console.log('🔒 Obfuscating JavaScript files...');
  console.log('   (This may take a few minutes)');
  console.log('');

  // Obfuscate root JS files
  const rootJsFiles = ['app.js'];
  for (const file of rootJsFiles) {
    if (await fs.pathExists(file)) {
      await obfuscateFile(file, `dist/${file}`);
      console.log(`  ✓ Obfuscated ${file}`);
    }
  }

  // Obfuscate JS folders
  const jsFolders = ['controllers', 'models', 'routes', 'middleware', 'services'];
  for (const folder of jsFolders) {
    if (await fs.pathExists(folder)) {
      const files = await fs.readdir(folder);
      await fs.ensureDir(`dist/${folder}`);

      let fileCount = 0;
      for (const file of files) {
        const sourcePath = path.join(folder, file);
        const destPath = path.join(`dist/${folder}`, file);

        if (file.endsWith('.js')) {
          await obfuscateFile(sourcePath, destPath);
          fileCount++;
        } else {
          await fs.copy(sourcePath, destPath);
          console.log(`  ✓ Copied ${folder}/${file}`);
        }
      }
      console.log(`  ✓ Obfuscated ${folder}/ (${fileCount} files)`);
    }
  }

  console.log('✅ JavaScript files obfuscated');
  console.log('');

  // 4. Copy package.json and other files
  console.log('📦 Copying package files...');
  const rootFiles = ['package.json', 'package-lock.json'];
  for (const file of rootFiles) {
    if (await fs.pathExists(file)) {
      await fs.copy(file, `dist/${file}`);
      console.log(`  ✓ Copied ${file}`);
    }
  }

  // Copy .env.example if exists
  if (await fs.pathExists('.env.example')) {
    await fs.copy('.env.example', 'dist/.env.example');
    console.log('  ✓ Copied .env.example');
  }
  console.log('✅ Package files copied');
  console.log('');

  // 5. Install production dependencies
  console.log('📦 Installing production dependencies...');
  console.log('   This may take a few minutes...');
  execSync('npm install --production --prefix dist', {
    stdio: 'inherit',
    cwd: __dirname,
  });
  console.log('✅ Dependencies installed');
  console.log('');

  // 6. Clean up unnecessary files
  console.log('🧹 Cleaning up unnecessary files...');
  const removeItems = [
    'dist/.env.example',
    'dist/tests',
    'dist/test',
    'dist/*.test.js',
    'dist/*.spec.js',
    'dist/*.md',
    'dist/Dockerfile',
    'dist/node_modules/.bin',
  ];

  for (const item of removeItems) {
    try {
      await fs.remove(item);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
  console.log('✅ Cleanup complete');
  console.log('');

  // 7. Create PM2 ecosystem file
  console.log('📝 Creating PM2 ecosystem file...');
  await fs.writeFile(
    'dist/ecosystem.config.js',
    `
module.exports = {
  apps: [{
    name: 'hrmd-app',
    script: 'app.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G',
    kill_timeout: 3000,
    listen_timeout: 5000
  }]
};
`,
  );
  console.log('✅ PM2 ecosystem file created');
  console.log('');

  // 8. Create logs folder
  console.log('📁 Creating logs folder...');
  await fs.ensureDir('dist/logs');
  console.log('✅ Logs folder created');
  console.log('');

  // 9. Display summary
  console.log('='.repeat(50));
  console.log('✅ BUILD COMPLETE!');
  console.log('='.repeat(50));
  console.log('');
  console.log('📁 Dist folder created at:');
  console.log(`   ${path.join(__dirname, 'dist')}`);
  console.log('');
  console.log('🔒 Your JavaScript code has been obfuscated!');
  console.log('');
  console.log('📝 NEXT STEPS:');
  console.log('   1. Copy your .env file:');
  console.log(`      copy .env dist\\.env`);
  console.log('');
  console.log('   2. Go to dist folder:');
  console.log('      cd dist');
  console.log('');
  console.log('   3. Deploy with PM2:');
  console.log('      npm install -g pm2');
  console.log('      pm2 start ecosystem.config.js');
  console.log('      pm2 save');
  console.log('');
}

// Obfuscate a single file with error handling
async function obfuscateFile(source, destination) {
  try {
    const code = await fs.readFile(source, 'utf8');

    const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATE_CONFIG);
    const obfuscatedCode = result.getObfuscatedCode();

    // Add a header comment
    const header = '// OBFUSCATED FOR SECURITY - DO NOT EDIT\n';
    await fs.writeFile(destination, header + obfuscatedCode);
  } catch (error) {
    console.error(`  ❌ Error obfuscating ${source}:`, error.message);
    // If obfuscation fails, copy the original file as fallback
    console.log(`  ⚠️  Falling back to copying original file`);
    await fs.copy(source, destination);
  }
}

// Run the build
build().catch((error) => {
  console.error('❌ Build failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
