const isEnabled = () => process.env.QUICKBOOKS_ENABLED === "true";

const hasConfig = () =>
  Boolean(process.env.QUICKBOOKS_COMPANY_ID) && Boolean(process.env.QUICKBOOKS_ACCESS_TOKEN);

export async function createInvoiceForLoad(loadId: string) {
  if (!isEnabled()) {
    throw new Error("QuickBooks integration disabled");
  }
  if (!hasConfig()) {
    throw new Error("QuickBooks not configured");
  }
  return { externalInvoiceRef: `QBO-${loadId.slice(0, 8)}` };
}

