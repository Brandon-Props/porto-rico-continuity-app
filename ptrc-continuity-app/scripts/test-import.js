const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:3100";

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.stack || err.message));

  const outDir = path.join(__dirname, "..", "smoke-shots");
  fs.mkdirSync(outDir, { recursive: true });
  const shot = (n) => page.screenshot({ path: path.join(outDir, n) });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForURL("**/login");
  await page.fill("input[placeholder='e.g. Adrian Diaz']", "Import Tester");
  await page.click("text=Continue");
  await page.waitForURL("**/productions");
  await page.click("text=+ New Production");
  await page.fill("input[placeholder*='Puerto Rico']", "Import Test Prod");
  await page.fill("input[placeholder*='Short code']", "IMP");
  await page.click("text=Create");
  await page.waitForURL("**/today");

  await page.goto(`${BASE}/schedule/import`);
  await page.setInputFiles("input[type=file]", "/tmp/test-schedule.csv");
  await page.waitForTimeout(500);
  await shot("import-01-mapped.png");

  await page.getByRole("button", { name: /Validate & Preview/ }).click();
  await page.waitForTimeout(500);
  await shot("import-02-preview.png");

  await page.getByRole("button", { name: /Import \d+ Rows/ }).click();
  await page.waitForTimeout(1000);
  await shot("import-03-done.png");

  await page.getByRole("button", { name: "Go to Schedule" }).click();
  await page.waitForURL("**/schedule");
  await page.waitForTimeout(500);
  await shot("import-04-schedule.png");

  await page.goto(`${BASE}/today`);
  await page.waitForTimeout(500);
  await shot("import-05-today.png");

  await page.goto(`${BASE}/scenes`);
  await page.waitForTimeout(500);
  await shot("import-06-scenes.png");

  console.log("IMPORT TEST DONE");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
