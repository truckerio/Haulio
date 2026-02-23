DO $$
BEGIN
  CREATE TYPE "AppearanceTheme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppearanceTextScale" AS ENUM ('DEFAULT', 'LARGE', 'XL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppearanceContrast" AS ENUM ('NORMAL', 'HIGH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppearanceFontWeight" AS ENUM ('NORMAL', 'BOLD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppearanceNavDensity" AS ENUM ('COMPACT', 'COMFORTABLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppearanceMotion" AS ENUM ('FULL', 'REDUCED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppearanceFocusRing" AS ENUM ('STANDARD', 'STRONG');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppearanceColorPreset" AS ENUM ('DEFAULT', 'SLATE', 'TEAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "appearanceTheme" "AppearanceTheme" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS "appearanceTextScale" "AppearanceTextScale" NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN IF NOT EXISTS "appearanceContrast" "AppearanceContrast" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "appearanceFontWeight" "AppearanceFontWeight" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "appearanceNavDensity" "AppearanceNavDensity" NOT NULL DEFAULT 'COMFORTABLE',
  ADD COLUMN IF NOT EXISTS "appearanceMotion" "AppearanceMotion" NOT NULL DEFAULT 'FULL',
  ADD COLUMN IF NOT EXISTS "appearanceFocusRing" "AppearanceFocusRing" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "appearanceColorPreset" "AppearanceColorPreset" NOT NULL DEFAULT 'DEFAULT';
