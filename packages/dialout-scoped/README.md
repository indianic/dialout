# @indianic/dialout

**This is an alias. The package you want is [`dialout`](https://www.npmjs.com/package/dialout).**

```bash
npm install -g dialout
```

Both names install the same agent and both give you the same `dialout` command.
This one exists so that the package resolves under the IndiaNIC organisation's
namespace; it contains no code of its own, only a dependency on `dialout` and a
one-line shim that runs it.

> **Install one or the other, not both.** They provide the same `dialout`
> binary, and npm will not overwrite an existing command — installing the second
> one globally fails with `EEXIST`. If you have one and want the other, remove
> the first: `npm uninstall -g dialout` or
> `npm uninstall -g @indianic/dialout`.

## If this 404s on an IndiaNIC machine

`@indianic/*` was mapped to a private registry for years, and that mapping
outlives the registry. A machine with this line in `~/.npmrc` will look for this
package in the wrong place and get a 404:

```
@indianic:registry=https://npm.indianic.in/
```

Either drop the line, or install the unscoped package instead — which is the
better answer anyway:

```bash
npm install -g dialout
```

Everything — what it does, how to set it up, the CLI reference, troubleshooting
— is documented on the real package:

**[npmjs.com/package/dialout](https://www.npmjs.com/package/dialout)** ·
[github.com/indianic/dialout](https://github.com/indianic/dialout) ·
[dialout.dev](https://www.dialout.dev)

## Licence

MIT. Copyright © 2026 IndiaNIC Infotech Ltd.
