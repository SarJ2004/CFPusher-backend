const express = require("express");
const axios = require("axios");
const cors = require("cors");
const puppeteer = require("puppeteer");
require("dotenv").config();

const app = express();
app.use(cors({ origin: "*" }));
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

app.get("/auth/github/callback", async (req, res) => {
  const { code } = req.query;

  const tokenRes = await axios.post(
    `https://github.com/login/oauth/access_token`,
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    },
    {
      headers: { Accept: "application/json" },
    }
  );
  const accessToken = tokenRes.data.access_token;
  res.redirect(
    `https://oalfhjhcbifihnhoppjkcjncmacgpdje.chromiumapp.org/?token=${accessToken}`
  );
});

app.get("/scrape", async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith("https://codeforces.com/")) {
    return res.status(400).json({ error: "Invalid Codeforces URL" });
  }

  try {
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Set a desktop user-agent to bypass bot detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("Navigating to Codeforces...");
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    // Wait for Cloudflare to issue clearance (usually within 5–10s)
    let clearanceSet = false;
    for (let i = 0; i < 60; i++) {
      const cookies = await page.cookies();
      if (cookies.some((c) => c.name === "cf_clearance")) {
        clearanceSet = true;
        break;
      }
      console.log(`Waiting for cf_clearance cookie (${i + 1}s)...`);
      await new Promise((r) => setTimeout(r, 1000)); // wait 1 second
    }

    if (!clearanceSet) {
      await browser.close();
      return res.status(403).json({
        error: "cf_clearance cookie was not detected within 60 seconds",
      });
    }

    // Wait for problem statement to load
    await page.waitForSelector(".problem-statement", { timeout: 15000 });

    const problemHtml = await page.$eval(
      ".problem-statement",
      (el) => el.innerHTML
    );

    await browser.close();
    console.log(problemHtml);
    res.json({ html: problemHtml });
  } catch (error) {
    console.error("Scraping error:", error.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

app.get("/code", async (req, res) => {
  // Get the URL from the query string and validate it
  const url = req.query.url;
  if (!url || !url.startsWith("https://codeforces.com/")) {
    return res.status(400).json({ error: "Invalid Codeforces URL" });
  }

  try {
    const browser = await puppeteer.launch({
      headless: false, // Use the "new" headless mode, or set to false for debugging
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Set a standard desktop user agent to mimic a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("Navigating to Codeforces submission page...");
    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    // Wait for Cloudflare to issue clearance (usually within 5–10 seconds)
    let clearanceSet = false;
    for (let i = 0; i < 60; i++) {
      const cookies = await page.cookies();
      if (cookies.some((c) => c.name === "cf_clearance")) {
        clearanceSet = true;
        break;
      }
      console.log(`Waiting for cf_clearance cookie (${i + 1}s)...`);
      await new Promise((r) => setTimeout(r, 1000)); // wait 1 second
    }

    if (!clearanceSet) {
      await browser.close();
      return res.status(403).json({
        error: "cf_clearance cookie was not detected within 60 seconds",
      });
    }

    // Wait for the code element to be loaded
    await page.waitForSelector("pre#program-source-text", { timeout: 15000 });

    // Scrape the submission code by extracting the inner text of the <pre> element
    const code = await page.$eval(
      "pre#program-source-text",
      (el) => el.innerText
    );

    await browser.close();
    console.log("Scraped code:", code.slice(0, 100)); // log first 100 characters for debugging
    res.json({ code });
  } catch (error) {
    console.error("Error scraping submission code:", error.message);
    res.status(500).json({ error: "Scraping submission code failed" });
  }
});

app.listen(3000, () => {
  console.log("server running on port 3000");
});
