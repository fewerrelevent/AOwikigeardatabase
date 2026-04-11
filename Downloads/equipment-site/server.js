// server.js
// Simple static file server so index.html can load equipment.json without CORS errors.
// Run: node server.js
// Then open: http://localhost:3000

const http   = require("http");
const fs     = require("fs");
const path   = require("path");
const { spawn } = require("child_process");

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".css":  "text/css",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

// Track if a scrape is already in progress so concurrent reloads don't stack
let scraping = false;

function runScraper() {
  return new Promise((resolve, reject) => {
    if (scraping) {
      return reject(new Error("Scrape already in progress"));
    }
    scraping = true;
    console.log("[refresh] Running generateEquipment.js…");

    const child = spawn("node", [path.join(ROOT, "generateEquipment.js")], {
      cwd: ROOT,
      stdio: "inherit", // pipe scraper output straight to your terminal
    });

    child.on("close", (code) => {
      scraping = false;
      if (code === 0) {
        console.log("[refresh] equipment.json updated ✓");
        resolve();
      } else {
        reject(new Error(`generateEquipment.js exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      scraping = false;
      reject(err);
    });
  });
}

const server = http.createServer(async (req, res) => {
  let urlPath = req.url.split("?")[0];

  // ── /refresh endpoint ──────────────────────────────────────────────────────
  if (urlPath === "/refresh") {
    try {
      await runScraper();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      const busy = err.message === "Scrape already in progress";
      res.writeHead(busy ? 202 : 500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // ── Static file serving ────────────────────────────────────────────────────
  if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

  const filePath = path.join(ROOT, urlPath);

  // Basic security: don't escape root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`404 — ${urlPath} not found`);
      } else {
        res.writeHead(500); res.end("Server error");
      }
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type":  mime,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n✓ Server running at http://localhost:${PORT}`);
  console.log(`  Serving files from: ${ROOT}`);
  console.log(`  Press Ctrl+C to stop.\n`);
});