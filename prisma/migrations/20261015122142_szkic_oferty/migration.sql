-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);
INSERT INTO "new_JobOffer" ("archivedAt", "area", "createdAt", "id", "level", "originalFileName", "rawText", "sourceType", "status", "storedFilePath", "title", "updatedAt") SELECT "archivedAt", "area", "createdAt", "id", "level", "originalFileName", "rawText", "sourceType", "status", "storedFilePath", "title", "updatedAt" FROM "JobOffer";
DROP TABLE "JobOffer";
ALTER TABLE "new_JobOffer" RENAME TO "JobOffer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
