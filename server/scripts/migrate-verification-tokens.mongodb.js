// Run with: mongosh "<connection-string>" server/scripts/migrate-verification-tokens.mongodb.js
// WARNING: the connection string MUST include the database name (e.g. .../virly?authSource=admin).
// Without it, the `db` global targets the `test` database and the backfill writes to the wrong place.
// Copies inline User verification tokens into the new verificationtokens collection. Idempotent.
db.users.find({ verificationTokenHash: { $ne: null } }).forEach((u) => {
  db.verificationtokens.updateOne(
    { userId: u._id },
    {
      $set: {
        userId: u._id,
        tokenHash: u.verificationTokenHash,
        expiresAt: u.verificationTokenExpiresAt || new Date(Date.now() + 24 * 3600 * 1000),
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
});
print("verification token backfill complete");
