// updateJson.js
import fetch from "node-fetch";
import fs from "fs";
import { execSync } from "child_process";

// Step 1: Fetch Lua module from Fandom
const apiURL = "https://roblox-arcane-odyssey.fandom.com/api.php?action=query&titles=Module:Equipment/data&prop=revisions&rvprop=content&format=json";

async function fetchLua() {
  const res = await fetch(apiURL);
  const data = await res.json();
  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  let luaText = pages[pageId].revisions[0]["*"];
  return luaText.replace(/^return\s+/, '').trim();
}

// Step 2: Simple Lua → JSON converter
function luaToJson(lua) {
  let jsonText = lua
    .replace(/nil/g, "null")
    .replace(/\[(\d+)\]/g, '"$1"')           // numeric keys
    .replace(/=/g, ":")                        // key=value → key: value
    .replace(/(\w+):/g, '"$1":')              // bare keys → quoted
    .replace(/'/g, '"');                       // single quotes → double quotes
  try {
    return JSON.stringify(JSON.parse(jsonText), null, 2);
  } catch(e) {
    console.error("Failed to parse Lua to JSON", e);
    return null;
  }
}

// Step 3: Write JSON to file
async function updateJson() {
  const lua = await fetchLua();
  const json = luaToJson(lua);
  if (!json) return;

  fs.writeFileSync("equipment.json", json);
  console.log("Updated equipment.json");

  // Step 4: Commit & push to GitHub
  execSync("git add equipment.json");
  execSync('git commit -m "Update equipment JSON"');
  execSync("git push");
  console.log("Pushed to GitHub");
}

updateJson();