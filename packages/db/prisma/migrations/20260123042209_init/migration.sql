-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

-- DropIndex
DROP INDEX "Load_loadNumber_key";

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "OrgSettings" ALTER COLUMN "requiredDocs" DROP DEFAULT,
ALTER COLUMN "requiredDriverDocs" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
