import net from 'node:net';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEFAULT_BACKEND_PORT = 3001;
const PORT_PROBE_TIMEOUT_MS = 200;

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue >= 65_536) {
    return null;
  }

  return parsedValue;
}

function canConnectToPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port,
    });

    const finish = (isReachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(isReachable);
    };

    socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function resolveBackendPort(): Promise<number> {
  const configuredBackendPort = parsePort(process.env.BACKEND_PORT);

  if (configuredBackendPort === null) {
    return DEFAULT_BACKEND_PORT;
  }

  const [configuredPortReachable, defaultPortReachable] = await Promise.all([
    canConnectToPort(configuredBackendPort),
    configuredBackendPort === DEFAULT_BACKEND_PORT
      ? Promise.resolve(false)
      : canConnectToPort(DEFAULT_BACKEND_PORT),
  ]);

  if (configuredPortReachable) {
    return configuredBackendPort;
  }

  if (defaultPortReachable) {
    console.warn(
      `[vite] BACKEND_PORT ${configuredBackendPort} is unreachable; falling back to ${DEFAULT_BACKEND_PORT}.`,
    );
    return DEFAULT_BACKEND_PORT;
  }

  return configuredBackendPort;
}


// https://vitejs.dev/config/
export default defineConfig(async () => {
  const backendPort = await resolveBackendPort();
  const proxyOptions = {
    target: `http://127.0.0.1:${backendPort}`,
    changeOrigin: false,
    secure: true,
    ws: false,
  };

  return {
    plugins: [react()],
    server: {
      host: "localhost",
      port: process.env.FRONTEND_PORT as unknown as number,
      proxy: {
        "^/(\\?.*)?$": proxyOptions,
        "^/api(/|(\\?.*)?$)": proxyOptions,
      },
      // ref: https://vite.dev/config/server-options.html#server-allowedhosts
      allowedHosts: true,
    },
  };
})
