# Milestone snapshot package (npm)

This repository includes a publishable snapshot package for fast developer bootstrap:

- package source: repository root (published directly)
- **npmjs (public):** `@www.hyperlinks.space/program-kit` — manage org and tokens: [www.hyperlinks.space on npm](https://www.npmjs.com/settings/www.hyperlinks.space/packages)
- **GitHub Packages:** `@hyperlinksspace/program-kit` (same version; GitHub requires the package scope to match this repo's owner)

## Verify publish payload locally

The npm package page uses `README.md` from the published tarball, not `npmReadMe.md`. The published package also includes **`fullREADME.md`**, a copy of the developer readme (saved before the npm readme replaces `README.md`). Match CI before `npm pack`, then restore:

```bash
cp README.md fullREADME.md
cp npmReadMe.md README.md
npm pack --dry-run
git checkout -- README.md
rm -f fullREADME.md
```

## Install snapshot as a developer

```bash
npx @www.hyperlinks.space/program-kit ./my-hsp-app
```

The CLI materializes the bundled package payload into your target folder, then you run:

```bash
cd my-hsp-app
npm install
```

## Release channels

- `latest`: immutable stable snapshots (tag workflow `snapshot-vX.Y.Z`)
- `next`: rolling snapshots from manual workflow dispatch

In the output, you'll find options to open the app in:

- [a development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [an Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [an iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).
