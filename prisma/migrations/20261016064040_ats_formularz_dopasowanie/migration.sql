-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN "email" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "phone" TEXT;

-- CreateTable
CREATE TABLE "QuickMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "requirementVersionId" TEXT NOT NULL,
    "score" REAL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickMatch_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuickMatch_requirementVersionId_fkey" FOREIGN KEY ("requirementVersionId") REFERENCES "RequirementVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "cvDocumentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'oczekuje',
    "statusMessage" TEXT,
    "aiStatus" TEXT,
    "aiStatusMessage" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'nowe',
    "stageChangedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'recznie',
    "consentAt" DATETIME,
    "consentText" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "JobOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_cvDocumentId_fkey" FOREIGN KEY ("cvDocumentId") REFERENCES "CvDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("candidateId", "createdAt", "cvDocumentId", "id", "notes", "offerId", "status", "statusMessage", "updatedAt") SELECT "candidateId", "createdAt", "cvDocumentId", "id", "notes", "offerId", "status", "statusMessage", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_offerId_idx" ON "Application"("offerId");
CREATE INDEX "Application_status_idx" ON "Application"("status");
CREATE UNIQUE INDEX "Application_candidateId_offerId_key" ON "Application"("candidateId", "offerId");
CREATE TABLE "new_JobOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "area" TEXT,
    "level" TEXT,
    "status" TEXT NOT NULL DEFAULT 'szkic',
    "sourceType" TEXT NOT NULL,
    "originalFileName" TEXT,
    "storedFilePath" TEXT,
    "rawText" TEXT NOT NULL,
    "summary" TEXT,
    "draftJson" TEXT,
    "draftError" TEXT,
    "slug" TEXT,
    "publicApply" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);
INSERT INTO "new_JobOffer" ("archivedAt", "area", "createdAt", "draftError", "draftJson", "id", "level", "originalFileName", "rawText", "sourceType", "status", "storedFilePath", "summary", "title", "updatedAt") SELECT "archivedAt", "area", "createdAt", "draftError", "draftJson", "id", "level", "originalFileName", "rawText", "sourceType", "status", "storedFilePath", "summary", "title", "updatedAt" FROM "JobOffer";
DROP TABLE "JobOffer";
ALTER TABLE "new_JobOffer" RENAME TO "JobOffer";
CREATE UNIQUE INDEX "JobOffer_slug_key" ON "JobOffer"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "QuickMatch_applicationId_createdAt_idx" ON "QuickMatch"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "StageEvent_applicationId_idx" ON "StageEvent"("applicationId");
