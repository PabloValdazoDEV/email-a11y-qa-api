CREATE TABLE "Draft" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "htmlOriginal" TEXT NOT NULL,
    "htmlCurrent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Draft_campaignId_key" ON "Draft"("campaignId");

ALTER TABLE "Draft"
    ADD CONSTRAINT "Draft_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
