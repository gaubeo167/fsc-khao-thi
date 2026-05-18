/*
  Warnings:

  - The `status` column on the `Attempt` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "Response" DROP CONSTRAINT "Response_attemptId_fkey";

-- AlterTable
ALTER TABLE "Attempt" DROP COLUMN "status",
ADD COLUMN     "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Attempt_studentId_status_idx" ON "Attempt"("studentId", "status");

-- CreateIndex
CREATE INDEX "Attempt_examId_status_idx" ON "Attempt"("examId", "status");

-- CreateIndex
CREATE INDEX "Response_attemptId_idx" ON "Response"("attemptId");

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
