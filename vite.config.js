import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = env.PORT ? Number.parseInt(env.PORT, 10) : undefined;
  const proxyTarget = env.VITE_API_PROXY_TARGET ?? (serverPort ? `http://localhost:${serverPort}` : 'http://localhost:3001');

  return {
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
