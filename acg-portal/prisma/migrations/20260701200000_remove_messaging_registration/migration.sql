-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_investorId_fkey";

-- AlterTable
ALTER TABLE "NotifPref" DROP COLUMN "newMessage";

-- DropTable
DROP TABLE "Message";

-- DropTable
DROP TABLE "Registration";

-- DropEnum
DROP TYPE "MessageAuthor";

-- DropEnum
DROP TYPE "RegistrationStatus";

