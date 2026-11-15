import { mergeConfig, type UserConfig } from 'vite';
import base from '../vite.config';

// The app's config (aliases, the node registry), running only the survey.
export default (env: { mode: string; command: 'build' | 'serve' }) => {
  const config = mergeConfig(
    (base as (env: unknown) => UserConfig)(env),
    {},
  ) as UserConfig & { test: Record<string, unknown> };
  config.test.include = ['scripts/survey.test.ts'];
  return config;
};
