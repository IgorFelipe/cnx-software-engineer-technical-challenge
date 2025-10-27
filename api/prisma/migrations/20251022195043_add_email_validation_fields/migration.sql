-- AlterTable
ALTER TABLE "mailing_entries" ADD COLUMN     "invalid_reason" VARCHAR(50),
ADD COLUMN     "validation_details" TEXT;

-- CreateIndex
CREATE INDEX "mailing_entries_invalid_reason_idx" ON "mailing_entries"("invalid_reason");
