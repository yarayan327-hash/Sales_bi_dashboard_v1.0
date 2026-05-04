const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "../..");
const ENV_PATH = path.join(REPO_ROOT, "sales-engine/.env");

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const [k, ...rest] = s.split("=");
    if (!process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function csvEscape(v) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  const headers = [
    "user_id",
    "sales_name",
    "group_name",
    "call_time",
    "call_status",
    "voice_id",
    "play_url",
    "down_url"
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map(h => csvEscape(r[h])).join(","));
  }
  return "\uFEFF" + lines.join("\n");
}

async function tryFill(page, selectors, value, label) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        await loc.fill(value, { timeout: 3000 });
        console.log(`filled ${label}: ${sel}`);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function login(page) {
  const username = process.env.CRM_USERNAME;
  const password = process.env.CRM_PASSWORD;
  const loginUrl = process.env.CRM_LOGIN_URL;

  if (!username || !password) throw new Error("Missing CRM_USERNAME / CRM_PASSWORD in sales-engine/.env");

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  // 👉 点击「兼职/首次登录」
  try {
    const link = page.locator("text=兼职/首次登录").first();
    if (await link.count()) {
      await link.click();
      console.log("clicked 兼职/首次登录");
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    } else {
      console.log("⚠️ 未找到 兼职登录入口，继续尝试直接填表");
    }
  } catch (e) {
    console.log("⚠️ 点击兼职登录失败:", e.message);
  }


  const okUser = await tryFill(page, [
    'input[name="username"]',
    'input[name="admin_name"]',
    'input[name="user_name"]',
    'input[name="loginName"]',
    'input[type="text"]',
    'input:not([type])'
  ], username, "username");

  const okPass = await tryFill(page, [
    'input[name="password"]',
    'input[name="admin_pwd"]',
    'input[type="password"]'
  ], password, "password");

  if (!okUser || !okPass) {
    await page.screenshot({ path: path.join(REPO_ROOT, "sales-engine/logs/crm_login_failed.png"), fullPage: true });
    throw new Error("Cannot find CRM login inputs. Screenshot saved: sales-engine/logs/crm_login_failed.png");
  }

  const buttons = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("登录")',
    'button:has-text("Login")',
    '.layui-btn'
  ];

  let clicked = false;
  for (const sel of buttons) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        await loc.click({ timeout: 3000 });
        clicked = true;
        break;
      }
    } catch (_) {}
  }

  if (!clicked) {
    await page.keyboard.press("Enter");
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  console.log("login submitted, current url:", page.url());
}

async function applyFilters(page, startDate, endDate, groupName) {
  const voiceListUrl = process.env.CRM_VOICE_LIST_URL;
  await page.goto(voiceListUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const startDay = startDate.slice(0, 10);
  const endDay = endDate.slice(0, 10);

  const groupMap = {
    "前端销售部001组": "5977",
    "前端销售部002组": "5978"
  };

  const groupId = groupMap[groupName];
  if (!groupId) throw new Error("Unknown groupName: " + groupName);

  await page.evaluate(({ startDay, endDay, groupId }) => {
    function setVal(el, val) {
      if (!el) return;
      el.value = val;
      el.setAttribute("value", val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    setVal(document.querySelector("#dateSelect"), `${startDay} - ${endDay}`);

    const group = document.querySelector("#group_id");
    if (group) {
      group.value = groupId;
      group.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 关键：清空座席，否则只查当前账号
    const admin = document.querySelector("#admin_id");
    if (admin) {
      admin.value = "";
      admin.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const userId = document.querySelector('input[name="user_id"]');
    if (userId) setVal(userId, "");

    const mobile = document.querySelector('input[name="mobile"]');
    if (mobile) setVal(mobile, "");
  }, { startDay, endDay, groupId });

  await page.waitForTimeout(500);

  await page.click('button[type="submit"], button.layui-btn');

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const shot = path.join(REPO_ROOT, `sales-engine/logs/filter_${groupName}_${startDay}_${endDay}.png`.replace(/[^\w./-]/g, "_"));
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.log("filter applied:", groupName, startDay, endDay, "screenshot:", shot);
}

async function scrapeCurrentFilter(page, totalPages) {
  const rows = [];
  const baseListUrl = "/CallCenterList/voiceList";
  const voiceApiBase = "/CallCenterList/ajaxAction/getVoiceUrl?id=";

  for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
    const pageRows = await page.evaluate(async ({ pageNo, baseListUrl, voiceApiBase }) => {
      const COL = {
        user: 0,
        sales_name: 2,
        group_name: 3,
        call_time: 4,
        call_status: 6
      };

      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      function cleanText(text) {
        return (text || "").replace(/\s+/g, " ").trim();
      }

      function parseUserId(text) {
        const m = cleanText(text).match(/\((\d+)\)/);
        return m ? m[1] : "";
      }

      function parseVoiceIdFromRow(tr) {
        const el = tr.querySelector('i[onclick^="downloadVoice"], [onclick^="downloadVoice"]');
        if (!el) return "";
        const onclick = el.getAttribute("onclick") || "";
        const m = onclick.match(/downloadVoice\('(\d+)'\)/);
        return m ? m[1] : "";
      }

      function buildPageUrl(pageNo) {
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        params.set("pageId", pageNo);
        return `${baseListUrl}?${params.toString()}`;
      }

      async function fetchPageHtml(pageNo) {
        const url = buildPageUrl(pageNo);
        const res = await fetch(url, { method: "GET", credentials: "include" });
        return await res.text();
      }

      async function fetchVoiceUrls(voiceId) {
        if (!voiceId) return { play_url: "", down_url: "" };
        try {
          const res = await fetch(`${voiceApiBase}${voiceId}`, {
            method: "GET",
            credentials: "include",
            headers: { "X-Requested-With": "XMLHttpRequest" }
          });
          const json = await res.json();
          return {
            play_url: json?.data?.play || "",
            down_url: json?.data?.down || ""
          };
        } catch (err) {
          return { play_url: "", down_url: "" };
        }
      }

      const html = await fetchPageHtml(pageNo);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;

      const trs = Array.from(wrapper.querySelectorAll(".layui-table tbody tr"));
      const data = [];

      for (let rowIndex = 0; rowIndex < trs.length; rowIndex++) {
        const tr = trs[rowIndex];
        const tds = Array.from(tr.querySelectorAll("td"));
        if (!tds.length) continue;

        const userText = cleanText(tds[COL.user]?.innerText || "");
        const user_id = parseUserId(userText);
        const sales_name = cleanText(tds[COL.sales_name]?.innerText || "");
        const group_name = cleanText(tds[COL.group_name]?.innerText || "");
        const call_time = cleanText(tds[COL.call_time]?.innerText || "");
        const call_status = cleanText(tds[COL.call_status]?.innerText || "");
        const voice_id = parseVoiceIdFromRow(tr);

        if (!user_id && !voice_id) continue;

        const voiceInfo = await fetchVoiceUrls(voice_id);
        data.push({
          user_id,
          sales_name,
          group_name,
          call_time,
          call_status,
          voice_id,
          play_url: voiceInfo.play_url,
          down_url: voiceInfo.down_url
        });

        await sleep(120);
      }

      return data;
    }, { pageNo, baseListUrl, voiceApiBase });

    console.log(`page ${pageNo}: ${pageRows.length} rows`);
    if (!pageRows.length && pageNo > 1) break;

    rows.push(...pageRows);
    await sleep(500);
  }

  return rows;
}

async function main() {
  loadEnv();

  const totalPages = Number(process.env.CRM_TOTAL_PAGES || "30");
  const outputPath = process.env.CRM_OUTPUT_CSV ? path.resolve(REPO_ROOT, process.env.CRM_OUTPUT_CSV) : path.join(REPO_ROOT, "sales-engine/data/input/call_voice_export_2026-04-full.csv");

  const groups = ["前端销售部001组", "前端销售部002组"];
  const ranges = [
    [
      process.env.CRM_SCRAPE_START || "2026-04-22 00:00:00",
      process.env.CRM_SCRAPE_END || "2026-04-25 23:59:59"
    ]
  ];

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  });

  const page = await context.newPage();

  await login(page);

  let all = [];

  for (const group of groups) {
    for (const [start, end] of ranges) {
      console.log("==== scrape ====", group, start, end);
      await applyFilters(page, start, end, group);
      const rows = await scrapeCurrentFilter(page, totalPages);
      console.log("scraped rows:", rows.length);

      all.push(...rows);

      const dedup = new Map();
      for (const r of all) {
        const key = `${r.user_id}__${r.voice_id}__${r.call_time}`;
        if (!dedup.has(key)) dedup.set(key, r);
      }
      all = Array.from(dedup.values());

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, toCsv(all), "utf8");
      console.log("saved cumulative csv:", outputPath, "rows:", all.length);
    }
  }

  await browser.close();

  console.log("DONE. final rows:", all.length);
  console.log("CSV:", outputPath);
}

main().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
