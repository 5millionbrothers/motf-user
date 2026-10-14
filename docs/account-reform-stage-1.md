# Account reform: stage 1

## Implemented

- Username/password login maps to existing Supabase user UUIDs. Password verification remains in Supabase Auth.
- Existing email login remains available during migration. Existing members can assign a username in My Account.
- New password accounts complete KCP verification once; contact email is optional and does not become an OAuth login identity.
- Kakao accounts complete basic name/contact/terms information without mandatory KCP verification or a password.
- Ordinary checkout and point/coupon preview require an active account, not KCP identity verification.
- Alcohol checkout requires an independent KCP adult-purchase verification. Its result expires after one year.
- Identity sessions are consumed atomically and adult verification is bound to the logged-in user.
- Password recovery supports username or legacy login email and checks the existing CI hash.
- A legacy unconfirmed email account can recover through KCP without treating its contact email as verified. Its old email remains a server-side login alias.
- Partner signup/login uses the same username flow. Pending partners can prepare their own listing; public listing approval remains separate.

## Apply

Run database migration 75 before deploying either frontend. Existing Supabase and KCP environment variables remain in use.
Do not create replacement Auth users for existing members. Do not disable Supabase email verification globally:
the new KCP signup path creates a confirmed internal credential after verification without claiming contact-email ownership.

## Still planned

This delivery implements the first milestone only. Organization membership/invitations/administrator transfer,
organization point wallets, multi-business memberships and representative/staff permissions are subsequent milestones.
No organization balances or business ownership links are migrated in this stage.

## Verification

Isolated PostgreSQL tests cover repeated migration, existing UUID/history preservation, username uniqueness and
service-only lookup/assignment, adult verification expiry and active-account checkout gating.
Mock API tests cover login failures, request limits, signup token replay, contact email separation, recovery and
adult identity binding. Chromium tests cover desktop/mobile signup, Kakao basic information and existing-member
username assignment. Real KCP/Kakao/Toss callbacks must still be verified after deployment to registered domains.
