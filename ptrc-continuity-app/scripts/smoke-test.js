const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:3100";

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--allow-file-access-from-files",
    ],
  });
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
  });

  const shot = async (name) => {
    await page.screenshot({ path: path.join(__dirname, "..", "smoke-shots", name), fullPage: false });
  };
  fs.mkdirSync(path.join(__dirname, "..", "smoke-shots"), { recursive: true });

  console.log("1. Login");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForURL("**/login");
  await page.fill("input[placeholder='e.g. Adrian Diaz']", "Adrian Test");
  await page.click("text=Continue");

  console.log("2. Create production");
  await page.waitForURL("**/productions");
  await page.click("text=+ New Production");
  await page.fill("input[placeholder*='Puerto Rico']", "Test Production 1898");
  await page.fill("input[placeholder*='Short code']", "TP1898");
  await page.click("text=Create");

  console.log("3. Today screen");
  await page.waitForURL("**/today");
  await shot("01-today.png");

  console.log("4. Create a scene");
  await page.click("text=Full Schedule");
  await page.waitForURL("**/schedule");
  await shot("02-schedule-empty.png");

  await page.goto(`${BASE}/scenes`);
  await page.click("text=+ Add Scene Manually");
  await page.fill("input[placeholder*='Scene number']", "36");
  await page.fill("input[placeholder='Description']", "Governor's Office confrontation");
  await page.click("text=Add Scene");
  await page.waitForURL("**/scenes/*");
  const sceneUrl = page.url();
  await shot("03-scene-detail.png");

  console.log("5. Go to camera and capture via fake device");
  await page.click("text=📷 TAKE PHOTO");
  await page.waitForURL("**/camera");
  await page.waitForTimeout(1500); // let getUserMedia attach
  await shot("04-camera.png");

  const captureBtn = page.locator("button[aria-label='Capture photo']");
  if (await captureBtn.count()) {
    await captureBtn.click();
    await page.waitForTimeout(800);
    await shot("05-camera-after-capture.png");
    await captureBtn.click();
    await page.waitForTimeout(800);
  } else {
    console.log("Fallback file-input camera path shown (no getUserMedia) — expected in some environments.");
  }

  console.log("6. Next Take + New Shot one-tap actions");
  await page.click("text=⏭ NEXT TAKE");
  await page.waitForTimeout(300);
  await shot("06-next-take.png");

  console.log("7. Back to scene, check photos appear");
  await page.goto(sceneUrl);
  await page.waitForTimeout(500);
  await shot("07-scene-with-photos.png");

  console.log("8. Open a photo in the viewer");
  const firstPhoto = page.locator("img").first();
  if (await firstPhoto.count()) {
    await firstPhoto.click();
    await page.waitForTimeout(500);
    await shot("08-photo-viewer.png");
  }

  console.log("9. Search screen");
  await page.goto(`${BASE}/search`);
  await page.waitForTimeout(300);
  await shot("09-search.png");

  console.log("10. Sync screen");
  await page.goto(`${BASE}/sync`);
  await page.waitForTimeout(300);
  await shot("10-sync.png");

  console.log("11. Offline capture test (airplane mode simulation)");
  await context.setOffline(true);
  await page.goto(`${BASE}/camera`);
  await page.waitForTimeout(1000);
  await shot("11-camera-offline.png");
  const offlineCaptureBtn = page.locator("button[aria-label='Capture photo']");
  if (await offlineCaptureBtn.count()) {
    await offlineCaptureBtn.click();
    await page.waitForTimeout(800);
    await shot("12-offline-capture.png");
  }
  await context.setOffline(false);

  console.log("ALL STEPS COMPLETED");
  await browser.close();
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
