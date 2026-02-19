# Local Prod Dependencies (Windows)

Use this checklist before running `prod-local`.

Recommended shell: PowerShell.

## Required downloads

1. Docker Desktop (WSL2 backend)  
Download: `https://www.docker.com/products/docker-desktop/`

2. Node.js 20 LTS  
Download: `https://nodejs.org/en/download/`

3. Git for Windows  
Download: `https://git-scm.com/download/win`

4. Install WSL2 + Ubuntu (if not already installed)
```powershell
wsl --install
```

## Winget install option

```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
```

## Enable pnpm via Corepack

```powershell
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

## Verify installation

```powershell
docker --version
docker compose version
node -v
pnpm -v
git --version
wsl -l -v
```

## Optional but recommended

1. Windows Terminal (better shell UX):  
`https://apps.microsoft.com/detail/9n0dx20hk701`

2. Keep Docker Desktop open before running local-prod commands.
