-- CreateTable
CREATE TABLE "JobOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "area" TEXT,
    "level" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aktywna',
    "sourceType" TEXT NOT NULL,
    "originalFileName" TEXT,
    "storedFilePath" TEXT,
    "rawText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "RequirementVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequirementVersion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "JobOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "inferred" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    CONSTRAINT "Requirement_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RequirementVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT,
    "fullNameNormalized" TEXT,
    "consentFuture" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CvDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storedFilePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "extractedText" TEXT,
    "textNormalized" TEXT,
    "extractionMethod" TEXT,
    "extractionWarnings" TEXT,
    "pageCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CvDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "cvDocumentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'oczekuje',
    "statusMessage" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "JobOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_cvDocumentId_fkey" FOREIGN KEY ("cvDocumentId") REFERENCES "CvDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "requirementVersionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effort" TEXT,
    "promptHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "matchScore" REAL,
    "potentialScore" REAL NOT NULL,
    "recommendation" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "technologiesNormalized" TEXT NOT NULL DEFAULT '',
    "scoringSnapshot" TEXT NOT NULL,
    "unverifiedEvidence" INTEGER NOT NULL DEFAULT 0,
    "injectionDetected" BOOLEAN NOT NULL DEFAULT false,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Analysis_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Analysis_requirementVersionId_fkey" FOREIGN KEY ("requirementVersionId") REFERENCES "RequirementVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RequirementVersion_offerId_version_key" ON "RequirementVersion"("offerId", "version");

-- CreateIndex
CREATE INDEX "Requirement_versionId_idx" ON "Requirement"("versionId");

-- CreateIndex
CREATE INDEX "CvDocument_sha256_idx" ON "CvDocument"("sha256");

-- CreateIndex
CREATE INDEX "CvDocument_candidateId_idx" ON "CvDocument"("candidateId");

-- CreateIndex
CREATE INDEX "Application_offerId_idx" ON "Application"("offerId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_offerId_key" ON "Application"("candidateId", "offerId");

-- CreateIndex
CREATE INDEX "Analysis_applicationId_createdAt_idx" ON "Analysis"("applicationId", "createdAt");
