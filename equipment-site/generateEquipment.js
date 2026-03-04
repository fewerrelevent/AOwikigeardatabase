// generateEquipment.js
const https = require("https");
const fs = require("fs");

const apiURL = "https://roblox-arcane-odyssey.fandom.com/api.php?action=query&titles=Module:Equipment/data&prop=revisions&rvprop=content&format=json";

https.get(apiURL, (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    try {
      const parsed = JSON.parse(data);
      const pages = parsed.query.pages;
      const pageId = Object.keys(pages)[0];
      let luaText = pages[pageId].revisions[0]["*"];
      luaText = luaText.replace(/^return\s+/, "").trim();

      // Very simple Lua → JSON conversion (handles most table structures)
      let jsonText = luaText
        .replace(/nil/g, "null")
        .replace(/\[(\d+)\]/g, '"$1"')
        .replace(/=/g, ":")
        .replace(/(\w+):/g, '"$1":')
        .replace(/'/g, '"');

      fs.writeFileSync("equipment.json", jsonText);
      console.log("equipment.json generated!");
    } catch (e) {
      console.error("Failed to generate JSON:", e);
    }
  });
}).on("error", (err) => {
  console.error("HTTPS request error:", err);
});