CREATE TABLE "Revision" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "htmlOriginal" TEXT NOT NULL,
    "htmlCorrected" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Revision_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "Revision_campaignId_version_key"
    ON "Revision"("campaignId", "version");

CREATE INDEX "Revision_campaignId_createdAt_idx"
    ON "Revision"("campaignId", "createdAt");

CREATE INDEX "Revision_createdByUserId_idx"
    ON "Revision"("createdByUserId");

ALTER TABLE "Revision"
    ADD CONSTRAINT "Revision_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Revision"
    ADD CONSTRAINT "Revision_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_revision_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Revision snapshots are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "Revision_immutable_update"
    BEFORE UPDATE ON "Revision"
    FOR EACH ROW
    EXECUTE FUNCTION "reject_revision_update"();
