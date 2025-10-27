-- CreateTable
CREATE TABLE "mailing_entries" (
    "id" UUID NOT NULL,
    "mailing_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt" TIMESTAMPTZ,
    "external_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mailing_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailing_progress" (
    "mailing_id" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "last_processed_line" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(50) NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mailing_progress_pkey" PRIMARY KEY ("mailing_id")
);

-- CreateTable
CREATE TABLE "dead_letters" (
    "id" UUID NOT NULL,
    "mailing_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mailing_entries_mailing_id_idx" ON "mailing_entries"("mailing_id");

-- CreateIndex
CREATE INDEX "mailing_entries_status_idx" ON "mailing_entries"("status");

-- CreateIndex
CREATE INDEX "mailing_entries_email_idx" ON "mailing_entries"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mailing_entries_mailing_id_email_key" ON "mailing_entries"("mailing_id", "email");

-- CreateIndex
CREATE INDEX "mailing_progress_status_idx" ON "mailing_progress"("status");

-- CreateIndex
CREATE INDEX "dead_letters_mailing_id_idx" ON "dead_letters"("mailing_id");

-- CreateIndex
CREATE INDEX "dead_letters_email_idx" ON "dead_letters"("email");
