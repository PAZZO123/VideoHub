-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ai_conversations_isGuest_updatedAt_idx" ON "ai_conversations"("isGuest", "updatedAt");
