-- CreateTable
CREATE TABLE "Shift" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "assignedUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shift_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shiftId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftResponse_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftResponse_shiftId_userId_key" ON "ShiftResponse"("shiftId", "userId");
