# QA V1 Checklist

## Manual Checks
1) Terminology (Shipper/Consignee)
- Expected: All user-facing labels show Shipper/Consignee instead of Pickup/Delivery (stop labels, POD checklist text, invoice header).

2) New load fields in UI + invoice
- Expected: Load create form accepts Shipper/Consignee refs, Pallet count, Weight lbs.
- Expected: Load details sidebar shows Freight + References with "—" when empty.
- Expected: Invoice PDF includes Shipper/Consignee refs + pallets/weight.

3) Operating entity selection
- Expected: Admin can create operating entities and set a default.
- Expected: Load create/edit chooses load type + operating entity.
- Expected: Invoice header/remit-to uses the load operating entity.

4) POD visibility without scrolling
- Expected: Load Details shows Documents & POD in sticky sidebar immediately.
- Expected: Status pill reflects Missing/Uploaded/Verified/Rejected.

5) Billing POD verification queue
- Expected: Default filter shows Missing POD + Needs Verify.
- Expected: Each row shows POD status pill, key load fields, and quick Open/Verify actions.

6) Load confirmations upload -> review -> create
- Expected: Upload loads in Loads > Import Load Confirmations.
- Expected: Review draft shows extracted pallets/weight/refs; user can edit and Create Load.
- Expected: Re-upload same document is idempotent (no duplicate load).

7) Phone tracking (driver portal)
- Expected: Driver can Start/Stop trip tracking and send a ping.
- Expected: Load Details tracking section shows last ping time and map link.

8) Samsara settings (dev)
- Expected: Admin > Integrations shows Samsara connect/disconnect and truck mapping fields.
- Expected: No token is logged; status updates on connect/disconnect.

## Known Limitations
- Scanned PDFs/images require local OCR tools (`ocrmypdf`, `tesseract-ocr`, `poppler-utils`).
- Phone tracking works best while the driver portal stays open.
- Samsara V1 uses token paste (OAuth later).
