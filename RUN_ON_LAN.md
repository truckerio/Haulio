# Run Haulio on LAN

Goal: access Haulio from other devices on the same LAN without localhost issues.

## 1) Find your LAN IP

**Windows**
```powershell
ipconfig
```
Look for IPv4 address, e.g. `192.168.1.50`.

**macOS/Linux**
```bash
ifconfig | rg "inet "
```

## 2) Set env vars

Set in your `.env` or `.env.docker` (or your deployment env):
```
NEXT_PUBLIC_API_URL=http://<LAN_IP>:4000
NEXT_PUBLIC_WEB_ORIGIN=http://<LAN_IP>:3000
WEB_ORIGIN=http://<LAN_IP>:3000
```

## 3) Start the stack

```bash
docker compose -f docker-compose.demo.yml up -d --build
```

## 4) Access from another device

Open:
```
http://<LAN_IP>:3000
```

API health checks:
```
curl http://<LAN_IP>:4000/health
curl http://<LAN_IP>:4000/
```

## 5) Windows Firewall

Allow inbound TCP ports:
- 3000 (web)
- 4000 (api)

## 6) Verification

From another device:
- `http://<LAN_IP>:3000` loads
- Browser DevTools → Network → API calls go to `http://<LAN_IP>:4000`

## 7) Dev mode on LAN

In `apps/web/package.json` dev script binds to `0.0.0.0`.
Run:
```bash
pnpm --filter @truckerio/web dev
```

