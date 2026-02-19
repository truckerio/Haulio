# Local Prod Dependencies (Mac)

Use this checklist before running `prod-local`.

## Required downloads

1. Docker Desktop for Mac  
Download: `https://www.docker.com/products/docker-desktop/`

2. Homebrew (package manager)  
Install:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

3. Node.js 20 LTS (via Homebrew)
```bash
brew install node@20
```

4. Git (via Homebrew)
```bash
brew install git
```

5. pnpm via Corepack
```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

## Verify installation

```bash
docker --version
docker compose version
node -v
pnpm -v
git --version
```

## Optional but recommended

1. OpenSSL (for generating secrets)
```bash
brew install openssl
```

2. Make sure Docker Desktop is running before using local-prod commands.
