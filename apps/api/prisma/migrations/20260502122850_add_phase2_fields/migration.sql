-- AlterTable
ALTER TABLE "usage_sessions" ADD COLUMN     "preSendInputCost" DOUBLE PRECISION,
ADD COLUMN     "preSendInputTokens" INTEGER,
ADD COLUMN     "sdkVersion" TEXT,
ADD COLUMN     "warningShown" BOOLEAN NOT NULL DEFAULT false;
