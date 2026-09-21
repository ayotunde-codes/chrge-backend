# Persisted key rotation

The CNG application key encrypts BVN/NIN and creates their keyed hashes. The staff MFA key encrypts TOTP secrets. Existing ciphertext cannot be read after a direct key replacement. The production database currently has no CNG or staff records; staging has persisted records and needs this sequence.

1. Take a database snapshot. Deploy this code with the existing current keys first, and confirm normal reads and staff sign-in.
2. Preserve each old key in a secure vault. In every backend service that uses the staging database, set `CNG_APPLICATION_PREVIOUS_ENCRYPTION_KEY` and `ADMIN_MFA_PREVIOUS_ENCRYPTION_KEY` to the respective old values. Set the current key variables to new, unrelated values. Deploy all consumers together. The previous MFA value must remain base64 encoded and decode to exactly 32 bytes.
3. Run `node dist/scripts/rotate-persisted-keys.js --cng --mfa` in the staging backend environment. It validates decryption and reports counts without changing the database. If any record fails, stop and restore the previous current-key configuration.
4. Run `node dist/scripts/rotate-persisted-keys.js --cng --mfa --apply` in the same environment. The script updates ciphertext and keyed hashes in one transaction and logs counts only. If a row changed concurrently, it rolls back; rerun the dry run before retrying.
5. Confirm existing CNG records remain readable and both staff accounts can complete TOTP sign-in. Remove the previous-key variables from all consumers and redeploy. Confirm current-only reads before deleting the old key from the vault.

`RECOVERY_CODE_PEPPER` is separate. Changing it invalidates every stored staff recovery code because only hashes are stored. Rotate it only after TOTP sign-in is confirmed and staff have a way to receive new recovery codes. JWT and refresh-pepper changes intentionally end existing sessions.
