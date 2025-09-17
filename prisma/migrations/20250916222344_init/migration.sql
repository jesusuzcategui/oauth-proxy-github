-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "githubUser" JSONB NOT NULL,
    "wordpressSite" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_installationId_key" ON "UserSession"("installationId");
