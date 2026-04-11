// generateEquipment.js
// Fetches Module:Equipment/data from the Arcane Odyssey wiki and writes equipment.json
// Run: node generateEquipment.js

const https = require("https");
const fs    = require("fs");

const API_URL =
  "https://roblox-arcane-odyssey.fandom.com/api.php" +
  "?action=query" +
  "&titles=Module:Equipment/data" +
  "&prop=revisions" +
  "&rvprop=content" +
  "&format=json";

// ── FETCH ──────────────────────────────────────────────────────────────────────
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "AO-EquipmentScraper/1.0" } }, (res) => {
      let buf = "";
      res.on("data", c => buf += c);
      res.on("end", () => resolve(buf));
    }).on("error", reject);
  });
}

// ── LUA PARSER ─────────────────────────────────────────────────────────────────
// Parses a Lua table literal into a JS value.
// Handles: nested tables, string keys (quoted + bare), integer keys,
// string values (single + double quoted + long brackets [[...]]),
// booleans, nil, numbers, multi-line comments, single-line comments.
function parseLua(src) {
  let pos = 0;

  function peek()  { return src[pos]; }
  function next()  { return src[pos++]; }
  function eof()   { return pos >= src.length; }

  function skipWS() {
    while (!eof()) {
      // single-line comment
      if (src.startsWith("--", pos)) {
        // long comment?
        if (src[pos + 2] === "[") {
          let eqCount = 0;
          let p = pos + 3;
          while (src[p] === "=") { eqCount++; p++; }
          if (src[p] === "[") {
            pos = p + 1;
            const close = "]" + "=".repeat(eqCount) + "]";
            const end = src.indexOf(close, pos);
            pos = end === -1 ? src.length : end + close.length;
            continue;
          }
        }
        // normal single-line
        while (!eof() && src[pos] !== "\n") pos++;
        continue;
      }
      if (" \t\r\n".includes(src[pos])) { pos++; continue; }
      break;
    }
  }

  function expect(ch) {
    skipWS();
    if (src[pos] !== ch) throw new Error(`Expected '${ch}' at pos ${pos}, got '${src[pos]}' (context: ...${src.slice(Math.max(0,pos-20),pos+20)}...)`);
    pos++;
  }

  function readLongString() {
    // we are sitting on the second [
    let eqCount = 0;
    while (src[pos] === "=") { eqCount++; pos++; }
    if (src[pos] !== "[") throw new Error("Invalid long string at " + pos);
    pos++; // skip opening [
    if (src[pos] === "\n") pos++; // skip optional newline
    const close = "]" + "=".repeat(eqCount) + "]";
    const end = src.indexOf(close, pos);
    if (end === -1) throw new Error("Unterminated long string");
    const s = src.slice(pos, end);
    pos = end + close.length;
    return s;
  }

  function readString(delim) {
    pos++; // skip opening quote
    let s = "";
    while (!eof()) {
      const c = src[pos];
      if (c === delim) { pos++; return s; }
      if (c === "\\") {
        pos++;
        const e = src[pos++];
        const escapes = { n:"\n", t:"\t", r:"\r", "\\":"\\", "'":"'", '"':'"', "0":"\0" };
        s += escapes[e] ?? e;
      } else {
        s += c; pos++;
      }
    }
    throw new Error("Unterminated string");
  }

  function readBareKey() {
    let k = "";
    while (!eof() && /[\w$]/.test(src[pos])) k += src[pos++];
    return k;
  }

  function readNumber() {
    let s = "";
    if (src[pos] === "-") s += src[pos++];
    while (!eof() && /[\d._xXa-fA-F]/.test(src[pos])) s += src[pos++];
    if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s, 16);
    return parseFloat(s);
  }

  function parseValue() {
    skipWS();
    if (eof()) throw new Error("Unexpected EOF");
    const c = src[pos];

    // table
    if (c === "{") return parseTable();

    // long string
    if (c === "[" && (src[pos+1] === "[" || src[pos+1] === "=")) {
      pos++; // skip first [
      return readLongString();
    }

    // quoted string
    if (c === '"' || c === "'") return readString(c);

    // boolean / nil
    if (src.startsWith("true", pos))  { pos += 4; return true; }
    if (src.startsWith("false", pos)) { pos += 5; return false; }
    if (src.startsWith("nil", pos))   { pos += 3; return null; }

    // number (including negative)
    if (c === "-" || /\d/.test(c)) {
  let start = pos;

  // read full numeric/expression chunk
  while (
    !eof() &&
    /[0-9+\-*/.() ]/.test(src[pos])
  ) {
    pos++;
  }

  const token = src.slice(start, pos).trim();

  // if it's a pure number → parse it
  if (/^-?\d+(\.\d+)?$/.test(token)) {
    return parseFloat(token);
  }

  // otherwise it's an expression like 2/11 → return as string
  return token;
}

// bare identifier fallback (e.g., ni36l)
if (/[a-zA-Z_]/.test(c)) {
  return readBareKey();
}

throw new Error(`Unexpected character '${c}' at pos ${pos} (context: ...${src.slice(Math.max(0,pos-20),pos+20)}...)`);
}

  function parseTable() {
    expect("{");
    const arr = [];   // items with explicit integer keys or no key
    const obj = {};   // items with string/other keys
    let autoIdx = 1;
    let hasStringKeys = false;

    while (true) {
      skipWS();
      if (eof() || src[pos] === "}") { pos++; break; }

      let key = null;

      // [expr] = value
      if (src[pos] === "[" && src[pos+1] !== "[" && src[pos+1] !== "=") {
        pos++; // skip [
        skipWS();
        const c = src[pos];
        if (c === '"' || c === "'") key = readString(c);
        else if (/\d|-/.test(c)) key = readNumber();
        else key = readBareKey();
        skipWS();
        expect("]");
        skipWS();
        expect("=");
      }
      // barekey = value (if next non-ws chars are word chars followed by =)
      else if (/[a-zA-Z_]/.test(src[pos])) {
        const saved = pos;
        const bare = readBareKey();
        skipWS();
        if (src[pos] === "=") {
          pos++; // skip =
          key = bare;
        } else {
          // not a key, restore and parse as value
          pos = saved;
        }
      }

      const val = parseValue();

      if (key === null) {
        // auto-index
        arr.push(val);
      } else {
        hasStringKeys = true;
        obj[key] = val;
      }

      skipWS();
      // optional comma or semicolon separator
      if (!eof() && (src[pos] === "," || src[pos] === ";")) pos++;
    }

    // Merge: if we have string keys, string keys win; auto-indexed go in too
    if (hasStringKeys) {
      arr.forEach((v, i) => { if (obj[i + 1] === undefined) obj[i + 1] = v; });
      return obj;
    }
    // Pure array — return as object with numeric string keys for JSON compat
    if (arr.length) {
      const o = {};
      arr.forEach((v, i) => o[i + 1] = v);
      return o;
    }
    return obj;
  }

  // entry point
  skipWS();
  // strip leading "return" if present
  if (src.startsWith("return", pos)) {
    pos += 6;
    skipWS();
  }

  const result = parseValue();
  return result;
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching equipment data from wiki…");
  let raw;
  try {
    raw = await fetchPage(API_URL);
  } catch (e) {
    console.error("Network error:", e.message);
    process.exit(1);
  }

  let apiResponse;
  try {
    apiResponse = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse API JSON response:", e.message);
    process.exit(1);
  }

  const pages  = apiResponse?.query?.pages;
  if (!pages) { console.error("Unexpected API response structure."); process.exit(1); }

  const pageId  = Object.keys(pages)[0];
  const page    = pages[pageId];

  if (page.missing !== undefined) {
    console.error("Wiki page not found or missing.");
    process.exit(1);
  }

  const luaText = page?.revisions?.[0]?.["*"];
  if (!luaText) { console.error("No revision content found."); process.exit(1); }

  console.log(`Got ${luaText.length.toLocaleString()} chars of Lua. Parsing…`);

  let data;
  try {
    data = parseLua(luaText);
  } catch (e) {
    console.error("Lua parse error:", e.message);
    // Write raw lua for debugging
    fs.writeFileSync("equipment_raw.lua", luaText);
    console.log("Raw Lua saved to equipment_raw.lua for inspection.");
    process.exit(1);
  }

  const count = Object.keys(data).length;
  console.log(`Parsed ${count} equipment entries.`);

  fs.writeFileSync("equipment.json", JSON.stringify(data, null, 2));
  console.log("✓ equipment.json written successfully!");
}

main();