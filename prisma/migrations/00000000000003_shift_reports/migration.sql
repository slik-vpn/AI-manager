-- CreateTable
CREATE TABLE "ShiftReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shiftId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "guestsCount" INTEGER,
    "hadProblems" BOOLEAN NOT NULL,
    "hadDamage" BOOLEAN NOT NULL,
    "hadConflict" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShiftReport_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftReport_shiftId_key" ON "ShiftReport"("shiftId");
