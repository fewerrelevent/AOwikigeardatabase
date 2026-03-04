const fetch = require("node-fetch");
const fs = require("fs");

const apiURL = "https://roblox-arcane-odyssey.fandom.com/api.php?action=query&titles=Module:Equipment/data&prop=revisions&rvprop=content&format=json";

async function fetchLuaModule() {
  const res = await fetch(apiURL);
  const data = await res.json();
  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  let luaText = pages[pageId].revisions[0]["*"];
  return luaText.replace(/^return\s+/, "").trim();
}

function luaToJson(lua) {
  let jsonText = lua
    .replace(/nil/g, "null")
    .replace(/\[(\d+)\]/g, '"$1"')
    .replace(/=/g, ":")
    .replace(/(\w+):/g, '"$1":')
    .replace(/'/g, '"');
  try {
    return JSON.stringify(JSON.parse(jsonText), null, 2);
  } catch (e) {
    console.error("Failed to parse Lua:", e);
    return null;
  }
}

async function generateJSON() {
  const lua = await fetchLuaModule();
  const json = luaToJson(lua);
  if (!json) return;
  fs.writeFileSync("equipment.json", json);
  console.log("equipment.json generated!");
}

generateJSON();