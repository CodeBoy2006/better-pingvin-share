-- AlterTable
ALTER TABLE "ShareSecurity" ADD COLUMN "maxIps" INTEGER;

-- CreateTable
CREATE TABLE "ShareSecurityAllowedIp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "shareSecurityId" TEXT NOT NULL,
    CONSTRAINT "ShareSecurityAllowedIp_shareSecurityId_fkey" FOREIGN KEY ("shareSecurityId") REFERENCES "ShareSecurity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShareSecurityAssignedIp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "shareSecurityId" TEXT NOT NULL,
    CONSTRAINT "ShareSecurityAssignedIp_shareSecurityId_fkey" FOREIGN KEY ("shareSecurityId") REFERENCES "ShareSecurity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareSecurityAllowedIp_shareSecurityId_ipAddress_key" ON "ShareSecurityAllowedIp"("shareSecurityId", "ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ShareSecurityAssignedIp_shareSecurityId_ipAddress_key" ON "ShareSecurityAssignedIp"("shareSecurityId", "ipAddress");
