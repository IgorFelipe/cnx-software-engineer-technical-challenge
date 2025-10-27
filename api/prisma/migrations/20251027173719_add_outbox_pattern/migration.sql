-- CreateTable
CREATE TABLE "mailings" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "storage_url" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt" TIMESTAMPTZ,
    "error_message" TEXT,
    "total_lines" INTEGER,
    "processed_lines" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mailings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "mailing_id" UUID NOT NULL,
    "target_queue" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_dead_letters" (
    "id" UUID NOT NULL,
    "mailing_id" UUID NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mailings_status_idx" ON "mailings"("status");

-- CreateIndex
CREATE INDEX "mailings_created_at_idx" ON "mailings"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mailings_filename_key" ON "mailings"("filename");

-- CreateIndex
CREATE INDEX "outbox_messages_mailing_id_idx" ON "outbox_messages"("mailing_id");

-- CreateIndex
CREATE INDEX "outbox_messages_published_idx" ON "outbox_messages"("published");

-- CreateIndex
CREATE INDEX "outbox_messages_target_queue_idx" ON "outbox_messages"("target_queue");

-- CreateIndex
CREATE INDEX "outbox_messages_created_at_idx" ON "outbox_messages"("created_at");

-- CreateIndex
CREATE INDEX "outbox_dead_letters_mailing_id_idx" ON "outbox_dead_letters"("mailing_id");

-- CreateIndex
CREATE INDEX "outbox_dead_letters_created_at_idx" ON "outbox_dead_letters"("created_at");

-- AddForeignKey
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_mailing_id_fkey" FOREIGN KEY ("mailing_id") REFERENCES "mailings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
