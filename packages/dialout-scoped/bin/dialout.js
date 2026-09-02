#!/usr/bin/env node
// Delegates straight to the real implementation.
//
// This package exists only so that `@indianic/dialout` resolves under the
// organisation's namespace. It ships no code of its own — `dialout` is the
// package that does the work, and this depends on it.
//
// The require is resolved from this package's own node_modules, so whichever
// version of `dialout` the dependency range installed is the one that runs.
// There is deliberately no version check here: pinning would mean this alias
// has to be republished for every agent release, which is exactly the
// maintenance burden it is supposed to avoid.
require('dialout/dist/cli.js');
