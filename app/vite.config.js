import { spawnSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const CLIENT_PORT = 5173;

export default defineConfig({
  plugins: [react(), freePortPlugin(CLIENT_PORT)],
  server: {
    port: CLIENT_PORT,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3210",
      "/media": "http://127.0.0.1:3210"
    }
  }
});

// Kill whatever is holding the client port before Vite tries to bind it.
// Server-side does the same for 3210; this keeps the client URL stable too.
function freePortPlugin(port) {
  return {
    name: "free-port",
    apply: "serve",
    async configResolved() {
      killPortOwner(port);
      // Give Windows a moment to actually release the socket.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  };
}

function killPortOwner(port) {
  const pids = new Set();
  if (process.platform === "win32") {
    const result = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
    if (result.status !== 0) return;
    for (const line of result.stdout.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5 || parts[3] !== "LISTENING") continue;
      if (!parts[1].endsWith(`:${port}`)) continue;
      pids.add(parts[4]);
    }
    for (const pid of pids) spawnSync("taskkill", ["/F", "/PID", pid]);
  } else {
    const result = spawnSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" });
    if (result.status !== 0) return;
    for (const pid of result.stdout.split(/\s+/).filter(Boolean)) pids.add(pid);
    for (const pid of pids) spawnSync("kill", ["-9", pid]);
  }
}
