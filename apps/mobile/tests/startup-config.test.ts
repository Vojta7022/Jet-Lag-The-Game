import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJsonFile<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(mobileRoot, relativePath), 'utf8')) as T;
}

test('mobile workspace keeps the minimum startup dependencies and scripts aligned', () => {
  const packageJson = readJsonFile<{
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  }>('package.json');

  assert.equal(packageJson.scripts.start, 'expo start --clear');
  assert.equal(packageJson.scripts.ios, 'expo start --clear --ios');
  assert.equal(packageJson.scripts.android, 'expo start --clear --android');
  assert.equal(packageJson.scripts.web, 'expo start --clear --web');
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit -p tsconfig.json');

  assert.ok(packageJson.dependencies.expo);
  assert.ok(packageJson.dependencies['@expo/metro-runtime']);
  assert.ok(packageJson.dependencies['expo-router']);
  assert.ok(packageJson.dependencies.react);
  assert.ok(packageJson.dependencies['react-native']);
  assert.ok(packageJson.dependencies['react-native-gesture-handler']);
  assert.ok(packageJson.dependencies['react-native-safe-area-context']);
  assert.ok(packageJson.dependencies['react-native-screens']);
  assert.ok(packageJson.dependencies['react-native-svg']);
  assert.ok(packageJson.dependencies['react-dom']);
  assert.ok(packageJson.devDependencies['babel-preset-expo']);
});

test('expo app config and monorepo config files keep the mobile shell startup hooks in place', () => {
  const appJson = readJsonFile<{
    expo: {
      plugins?: string[];
      scheme?: string;
      android?: {
        package?: string;
      };
    };
  }>('app.json');
  const metroConfig = readFileSync(path.join(mobileRoot, 'metro.config.cjs'), 'utf8');
  const babelConfig = readFileSync(path.join(mobileRoot, 'babel.config.cjs'), 'utf8');

  assert.ok(appJson.expo.plugins?.includes('expo-router'));
  assert.equal(appJson.expo.scheme, 'transithideseek');
  assert.equal(appJson.expo.android?.package, 'com.transithideseek.mobile');
  assert.match(metroConfig, /disableHierarchicalLookup/);
  assert.match(metroConfig, /unstable_enableSymlinks/);
  assert.match(metroConfig, /node:crypto/);
  assert.match(babelConfig, /babel-preset-expo/);
});
