# Study Mission

## Level 3 Stage 2

Study Mission now supports personal assignments and secure study groups. Groups use short invite codes, shared assignments, and per-member completion documents so each member can complete the same assignment independently.

### Firebase setup

1. In Firebase Authentication, enable the Email/Password provider.
2. Create a Firestore database.
3. Publish the local `firestore.rules` file manually from the Firebase console or Firebase CLI.
4. Do not change the deterministic hidden-email behavior used by the username login flow.

### Two-user test

1. Create two Firebase accounts in separate browser profiles using different usernames.
2. Log in as User A, create a study group, and copy its six-character invite code.
3. Log in as User B in the other profile, join with that code, and confirm the group appears.
4. Add a shared assignment as User A and confirm it appears for User B.
5. Complete it as User A. Confirm User A sees their checkmark while User B still sees it incomplete.
6. Complete it as User B. Confirm the group progress reflects both member completions.
7. Try loading or changing the group data while logged in as a third account that has not joined. Firestore should deny the request.