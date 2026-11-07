import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { cp } from 'node:fs/promises';
import path from 'node:path';

// The Vite plugin only packages its own build output, so the Agent SDK
// (kept external in vite.main.config.mts) and its native CLI binary are
// copied in by hand.
const agentSdkPackages = (platform: string, arch: string) => [
  '@anthropic-ai/claude-agent-sdk',
  `@anthropic-ai/claude-agent-sdk-${platform}-${arch}`,
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // A binary can't be executed from inside the asar archive.
      unpack: '**/node_modules/@anthropic-ai/claude-agent-sdk-*/**',
    },
  },
  hooks: {
    packageAfterCopy: async (
      _config,
      buildPath,
      _electronVersion,
      platform,
      arch,
    ) => {
      for (const pkg of agentSdkPackages(platform, arch)) {
        await cp(
          path.join(import.meta.dirname, 'node_modules', pkg),
          path.join(buildPath, 'node_modules', pkg),
          { recursive: true },
        );
      }
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
