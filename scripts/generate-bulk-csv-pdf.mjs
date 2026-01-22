import path from "path";
import fs from "fs/promises";
import puppeteer from "puppeteer";

const root = "/Users/karanpreetsingh/demo-truckerio1";
const htmlPath = path.join(root, "docs", "bulk-csv-guide.html");
const pdfPath = path.join(root, "docs", "bulk-csv-guide.pdf");

const html = await fs.readFile(htmlPath, "utf8");

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
await browser.close();

console.log(`PDF written to ${pdfPath}`);
