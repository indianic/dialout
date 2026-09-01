const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const shared = path.resolve(projectRoot, '../devdash-shared');

const config = getDefaultConfig(projectRoot);

// The sibling checkout only exists in this monorepo. On an EAS build server the
// project is uploaded on its own and @dialout/shared comes from the
// registry, so pointing watchFolders/extraNodeModules at a missing path there
// breaks resolution before the bundle starts.
if (fs.existsSync(shared)) {
  // Append — replacing watchFolders drops folders Expo already registered
  // and Metro then constructs a transformer against a broken graph.
  config.watchFolders = [...new Set([...(config.watchFolders || []), shared])];
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    '@dialout/shared': shared,
  };
}

const mobileNm = path.resolve(projectRoot, 'node_modules');
config.resolver.nodeModulesPaths = [
  mobileNm,
  ...(config.resolver.nodeModulesPaths || []),
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(mobileNm, 'react'),
  'react-dom': path.resolve(mobileNm, 'react-dom'),
  'react-native': path.resolve(mobileNm, 'react-native'),
};
config.resolver.unstable_enableSymlinks = true;
// Package "exports" on this volume reports react/index.js as missing even
// when the file is on disk (Metro InvalidPackageError). File-based resolve works.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
