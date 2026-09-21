import { defineConfig } from 'astro/config';
const origin = process.env.SHOWCASE_ORIGIN;
if (origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('SHOWCASE_ORIGIN must be an HTTPS origin without credentials, path or query.');
}
// This foundation is deliberately preview-only until the publication gates in #356 pass.
if (process.env.SHOWCASE_DEPLOY_TARGET === 'production')
  throw new Error('Production requires the source-rights, domain and release gates in #356.');
export default defineConfig({ site: origin, output: 'static', trailingSlash: 'always', devToolbar: { enabled: false } });
