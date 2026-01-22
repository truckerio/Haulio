import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { format } from "date-fns";
import type { Load, Stop, OrgSettings, Customer, InvoiceLineItem, Prisma } from "@truckerio/db";
import { formatUSD } from "@truckerio/db";
import { ensureUploadDirs, resolveUploadPath } from "./uploads";

export function renderInvoiceHtml(params: {
  invoiceNumber: string;
  load: Load & { customer?: Customer | null };
  stops: Stop[];
  settings: OrgSettings;
  items: InvoiceLineItem[];
  totalAmount: Prisma.Decimal | null;
}) {
  const pickup = params.stops.find((stop) => stop.type === "PICKUP");
  const delivery = params.stops.find((stop) => stop.type === "DELIVERY");
  const customerName = params.load.customer?.name ?? params.load.customerName ?? "Customer";
  const total = params.totalAmount ? formatUSD(params.totalAmount) : "0.00";
  const shipperRef = params.load.shipperReferenceNumber;
  const consigneeRef = params.load.consigneeReferenceNumber;
  const palletCount = params.load.palletCount;
  const weightLbs = params.load.weightLbs;

  return `
  <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
        h1 { margin: 0 0 6px; }
        .muted { color: #666; }
        .row { display: flex; justify-content: space-between; margin-top: 20px; }
        .box { border: 1px solid #ddd; padding: 12px; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
        .total { font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Invoice ${params.invoiceNumber}</h1>
      <div class="muted">${params.settings.companyDisplayName}</div>
      <div class="row">
        <div class="box" style="width: 48%;">
          <div><strong>Remit To</strong></div>
          <div style="white-space: pre-line">${params.settings.remitToAddress}</div>
        </div>
        <div class="box" style="width: 48%;">
          <div><strong>Invoice Details</strong></div>
          <div>Load: ${params.load.loadNumber}</div>
          <div>Customer: ${customerName}</div>
          ${shipperRef ? `<div>Shipper ref: ${shipperRef}</div>` : ""}
          ${consigneeRef ? `<div>Consignee ref: ${consigneeRef}</div>` : ""}
          ${palletCount !== null && palletCount !== undefined ? `<div>Pallets: ${palletCount}</div>` : ""}
          ${weightLbs !== null && weightLbs !== undefined ? `<div>Weight: ${weightLbs} lbs</div>` : ""}
          <div>Issued: ${format(new Date(), "PPP")}</div>
          <div>Terms: ${params.settings.invoiceTerms}</div>
        </div>
      </div>
      <div class="row">
        <div class="box" style="width: 48%;">
          <div><strong>Shipper</strong></div>
          <div>${pickup?.name ?? ""}</div>
          <div class="muted">${pickup?.address ?? ""}, ${pickup?.city ?? ""} ${pickup?.state ?? ""}</div>
        </div>
        <div class="box" style="width: 48%;">
          <div><strong>Consignee</strong></div>
          <div>${delivery?.name ?? ""}</div>
          <div class="muted">${delivery?.address ?? ""}, ${delivery?.city ?? ""} ${delivery?.state ?? ""}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
        </thead>
        <tbody>
          ${params.items
            .map((item) => {
              const description = item.description ?? item.code;
              const quantity = item.quantity ? item.quantity.toString() : "-";
              const rate = item.rate ? `$${formatUSD(item.rate)}` : "-";
              const amount = `$${formatUSD(item.amount)}`;
              return `<tr><td>${description}</td><td>${quantity}</td><td>${rate}</td><td>${amount}</td></tr>`;
            })
            .join("")}
          <tr class="total"><td>Total</td><td></td><td></td><td>$${total}</td></tr>
        </tbody>
      </table>
      <p class="muted">${params.settings.invoiceFooter}</p>
    </body>
  </html>`;
}

export async function generateInvoicePdf(params: {
  invoiceNumber: string;
  load: Load & { customer?: Customer | null };
  stops: Stop[];
  settings: OrgSettings;
  items: InvoiceLineItem[];
  totalAmount: Prisma.Decimal | null;
}) {
  await ensureUploadDirs();
  const html = renderInvoiceHtml(params);
  const filename = `${params.invoiceNumber}.pdf`;
  const relativePath = path.posix.join("invoices", filename);
  const filePath = resolveUploadPath(relativePath);

  const launchArgs =
    process.env.PUPPETEER_NO_SANDBOX === "true"
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [];
  const browser = await puppeteer.launch({
    headless: "new",
    args: launchArgs,
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({ path: filePath, format: "A4", printBackground: true });
  await browser.close();

  await fs.access(filePath);
  return { filePath: relativePath, filename };
}
