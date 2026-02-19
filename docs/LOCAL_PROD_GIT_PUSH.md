# Local Prod Git Push Guide

Use this when publishing the local-prod devkit branch and tags for the team.

## 1) Push branch

```bash
git checkout release/prod-local-devkit
git push origin release/prod-local-devkit
```

## 2) Push release tags

```bash
git push origin prod-local-v1.0.0 prod-local-v1.1.0
```

If you created a newer tag (example `prod-local-v1.2.0`):

```bash
git push origin prod-local-v1.2.0
```

## 3) Verify remote branch/tags

```bash
git ls-remote --heads origin release/prod-local-devkit
git ls-remote --tags origin | rg \"prod-local-v\"
```

## 4) Share teammate pull commands

```bash
git clone <YOUR_REPO_URL> demo-truckerio1
cd demo-truckerio1
git fetch --all --tags
git checkout release/prod-local-devkit
```

or fixed release:

```bash
git checkout tags/prod-local-v1.1.0 -b prod-local-v1.1.0
```
