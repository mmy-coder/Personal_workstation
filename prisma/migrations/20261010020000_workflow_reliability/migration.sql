CREATE TABLE "MutationReceipt" (
 "key" TEXT NOT NULL PRIMARY KEY,
 "fingerprint" TEXT NOT NULL,
 "response" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SubscriptionPayment" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "version" INTEGER NOT NULL DEFAULT 0,
 "subscriptionId" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "category" TEXT NOT NULL,
 "amountCents" INTEGER NOT NULL,
 "paidOn" TEXT NOT NULL,
 "dueOn" TEXT NOT NULL,
 "notes" TEXT NOT NULL DEFAULT '',
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "SubscriptionPayment_paidOn_idx" ON "SubscriptionPayment"("paidOn");
ALTER TABLE "Subscription" ADD COLUMN "renewalAnchorDay" INTEGER;
