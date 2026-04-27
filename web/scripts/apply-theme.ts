#!/usr/bin/env bun
// apply-theme.ts — fetch a shadcn v4 theme from GitHub and patch web/src/index.css
//
// Full themes (neutral, zinc, stone, mauve, olive, mist, taupe, amber):
//   replace ALL CSS vars in :root and .dark
//
// Color overrides (blue, rose, violet, green, etc.):
//   only patch the vars the theme defines; everything else (bg, border, ring...) stays
//
// Usage: bun scripts/apply-theme.ts <theme-name>

import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const THEMES_URL =
  "https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/themes.ts"

const themeName = process.argv[2]
if (!themeName) {
  console.error("Usage: bun scripts/apply-theme.ts <theme-name>")
  console.error(
    "Full themes:   neutral stone zinc mauve olive mist taupe amber\n" +
    "Color accents: blue cyan emerald fuchsia green indigo lime orange\n" +
    "               pink purple red rose sky teal violet yellow"
  )
  process.exit(1)
}

console.log(`Fetching themes from GitHub...`)
const src = await fetch(THEMES_URL).then((r) => r.text())

// Locate theme block by name, then extract with brace-counting
const nameIdx = src.indexOf(`name: "${themeName}"`)
if (nameIdx === -1) {
  const names = [...src.matchAll(/name:\s*"(\w+)"/g)].map((m) => m[1])
  console.error(`Theme "${themeName}" not found.\nAvailable: ${names.join(", ")}`)
  process.exit(1)
}

function extractBraced(text: string, fromIdx: number): string {
  let start = fromIdx
  while (start < text.length && text[start] !== "{") start++
  let depth = 0, end = start
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break } }
  }
  return text.slice(start + 1, end)
}

// Get the cssVars block for this theme
let blockStart = nameIdx
while (blockStart > 0 && src[blockStart] !== "{") blockStart--
const themeBlock = extractBraced(src, blockStart - 1)
const cvIdx = themeBlock.indexOf("cssVars:")
const cssVarsBlock = extractBraced(themeBlock, cvIdx)

// Extract vars for a mode (light/dark) — handles both "key": "val" and key: "val"
function extractMode(block: string, mode: string): Record<string, string> {
  const modeIdx = block.indexOf(`${mode}:`)
  if (modeIdx === -1) return {}
  const inner = extractBraced(block, modeIdx)
  const vars: Record<string, string> = {}
  for (const line of inner.split("\n")) {
    // Match both: primary: "val"  AND  "primary-foreground": "val"
    const kv = line.match(/^\s*"?([^":\s]+(?:-[^":\s]+)*)"?\s*:\s*"([^"]+)"/)
    if (kv) vars[kv[1]] = kv[2]
  }
  return vars
}

const light = extractMode(cssVarsBlock, "light")
const dark = extractMode(cssVarsBlock, "dark")

if (!Object.keys(light).length) {
  console.error(`Could not parse light vars for theme "${themeName}"`)
  process.exit(1)
}

const cssPath = join(import.meta.dir, "../src/index.css")
let css = readFileSync(cssPath, "utf8")

// Check if this is a full theme (has background/foreground) or a color-only override
const isFull = "background" in light

if (isFull) {
  // Replace entire :root and .dark blocks
  function toBlock(vars: Record<string, string>, selector: string): string {
    return `${selector} {\n${Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}`
  }
  css = css.replace(/:root\s*\{[^]*?\n\}/m, toBlock(light, ":root"))
  css = css.replace(/\.dark\s*\{[^]*?\n\}/m, toBlock(dark, ".dark"))
  console.log(`✓ Applied full theme "${themeName}" — replaced all CSS vars`)
} else {
  // Patch only the vars this theme defines, leaving everything else intact
  let patched = 0
  for (const [selector, vars] of [[":root", light], [".dark", dark]] as const) {
    for (const [key, val] of Object.entries(vars)) {
      const existing = new RegExp(`(${selector}[^{]*\\{[^}]*)--${key}:[^;]+;`, "s")
      if (existing.test(css)) {
        css = css.replace(existing, `$1--${key}: ${val};`)
        patched++
      }
    }
  }
  console.log(`✓ Applied color theme "${themeName}" — patched ${patched} CSS vars`)
}

writeFileSync(cssPath, css)
