# Tycoon Portal Admin Guide for Sarthak

This guide is for the person managing the Tycoon Portal day to day.

Right now, the portal has two kinds of users:

- `admin`: full access to the portal
- `viewer`: read-only dispatch access

Important: user management is not inside the app yet. Adding users, changing roles, resetting access, and removing access currently happens in Supabase.

## 1. What you can do as admin

As an admin, you can use:

- Dashboard
- Punch Order
- View Orders
- Dispatch Plan
- Customer Sales
- Model Analysis
- Parties
- Items
- Profile

As a viewer, a user can only use:

- Dispatch Plan
- Order detail pages opened from dispatch planning
- Profile

Viewer accounts cannot edit data and do not see financial values in the read-only order detail view.

## 2. Your own first login

Your admin username is:

- `sarthakbatra`

For your very first login:

1. Open the portal login page.
2. Choose `First-time setup`.
3. Enter your username: `sarthakbatra`
4. Enter the setup code that was shared with you.
5. Create a password with at least 8 characters.

After that first setup is done, always use:

- `Login`

not `First-time setup`.

The portal signs users in with a username, but under the hood it creates an internal Supabase auth email in this format:

- `<username>@portal.tycoon.local`

That internal email is system-generated. Users do not need to know or use it directly.

## 3. How password changes work

If you are already signed in:

1. Open `Profile`.
2. Enter a new password.
3. Save it.

Important: the portal does not use users' real email inboxes. It uses internal addresses like `sarthakbatra@portal.tycoon.local`, so normal email-based password reset is not a reliable recovery path. If someone is locked out, use the reset process in this guide instead.

## 4. Important reality of this app today

Please keep these rules in mind:

- There is no in-app user management screen yet.
- To add or manage users, you need Supabase Dashboard access.
- Do not create portal users directly in `auth.users` as the normal workflow.
- The safe workflow is: create an invite in `public.allowed_users`, then let the person complete setup from the app.
- The app uses `public.user_profiles` to decide the user's real role and permissions after setup.

## 5. The three places that matter

### `public.allowed_users`

This is the invite list and first-time setup control table.

Use it for:

- adding a new person
- assigning the initial role
- giving them a setup code
- turning off a not-yet-used invite

Key fields:

- `username`: must be lowercase, trimmed, unique
- `role`: `admin` or `viewer`
- `setup_code`: one-time setup code shared privately
- `is_active`: whether the invite is active
- `auth_user_id`: filled automatically after setup is completed
- `setup_completed_at`: filled automatically after setup is completed

### `public.user_profiles`

This is the live role table actually used by the app and RLS.

Use it for:

- checking who has completed setup
- changing the role of an already-onboarded user

### `auth.users`

This is the Supabase authentication table.

Use it for:

- removing a user's ability to sign in
- resetting a user's account by deleting and re-onboarding them

## 6. How to add a new user

### Recommended non-technical flow

1. Open Supabase Dashboard.
2. Go to `Table Editor`.
3. Open `public.allowed_users`.
4. Insert a new row.

Fill it like this:

- `username`: lowercase username, for example `rahul` or `neha`
- `role`: `viewer` or `admin`
- `setup_code`: a private one-time code you will share with them
- `is_active`: `true`
- `auth_user_id`: leave empty
- `setup_completed_at`: leave empty

Then send the user:

- portal URL
- username
- setup code
- instruction to use `First-time setup` on the login page

Once they finish setup successfully:

- `auth_user_id` will be filled automatically
- `setup_completed_at` will be filled automatically
- a `public.user_profiles` row will be created automatically

### SQL version

If you prefer SQL, use:

```sql
insert into public.allowed_users (username, role, setup_code, is_active)
values ('rahul', 'viewer', 'change-this-code', true);
```

Use a fresh setup code each time. A random 10-12 character lowercase letters and numbers code is fine.

## 7. How the new user should onboard

Tell the new user to do exactly this:

1. Open the portal.
2. Go to `Login`.
3. Switch to `First-time setup`.
4. Enter their username.
5. Enter the setup code you shared.
6. Create their password.
7. Use normal `Login` from then on.

If the setup succeeds, the portal creates their real auth account and links it automatically.

## 8. How to change a user's role

This depends on whether the person has already completed setup.

### If they have not completed setup yet

Only update:

- `public.allowed_users.role`

Example:

```sql
update public.allowed_users
set role = 'admin'
where username = 'rahul';
```

### If they have already completed setup

You must update both tables:

- `public.allowed_users.role`
- `public.user_profiles.role`

Example:

```sql
update public.allowed_users
set role = 'admin'
where username = 'rahul';

update public.user_profiles
set role = 'admin'
where username = 'rahul';
```

Important: changing only `allowed_users.role` does not change the permissions of an already-onboarded user. After setup, live access comes from `public.user_profiles`.

If the user still sees old access for a moment, ask them to sign out and sign in again.

## 9. How to disable or remove a user

This is the most important caveat in the system today.

### If the person has not completed setup yet

You can disable the invite by setting:

```sql
update public.allowed_users
set is_active = false
where username = 'rahul';
```

That prevents first-time setup.

### If the person has already completed setup

Do not rely on `is_active = false` alone.

Why:

- `is_active` is checked during first-time setup
- existing signed-in users are controlled by `auth.users` and `public.user_profiles`

To remove a live user's access:

1. Open Supabase Dashboard.
2. Go to `Authentication` -> `Users`.
3. Find the user's internal email:
   - `<username>@portal.tycoon.local`
4. Delete that auth user.

What happens automatically:

- `public.user_profiles` is deleted automatically
- `public.allowed_users.auth_user_id` is cleared automatically

If you want them blocked permanently, also set:

```sql
update public.allowed_users
set is_active = false
where username = 'rahul';
```

If you want them fully removed from the system, delete the invite too:

```sql
delete from public.allowed_users
where username = 'rahul';
```

## 10. How to reset a user's account

Use this when:

- the user forgot their password and cannot log in
- the wrong person completed setup
- you want the user to onboard again from scratch

### Best reset method

1. Delete the user in Supabase `Authentication` -> `Users`.
2. Reissue a fresh setup code in `public.allowed_users`.
3. Clear old setup completion fields.
4. Ask the person to use `First-time setup` again.

SQL:

```sql
update public.allowed_users
set setup_code = 'new-setup-code',
    auth_user_id = null,
    setup_completed_at = null,
    is_active = true,
    updated_at = timezone('utc', now())
where username = 'rahul';
```

Then tell the user to onboard again through the app.

## 11. Common issues and exact fix

### "Username is not allowed for this portal."

Check `public.allowed_users`:

- row exists for that username
- username is lowercase
- `is_active = true`

### "Setup code is invalid."

The code entered does not match `public.allowed_users.setup_code`.

Fix:

- recheck the code
- or issue a fresh one

### "Account setup has already been completed."

This means the user already has a linked auth account.

Fix:

- ask them to use normal `Login`
- if they are locked out, use the reset process

### "I changed someone to admin but they still look like a viewer."

You probably updated only `public.allowed_users`.

Fix:

- update `public.user_profiles.role` too

### "I set is_active to false, but they can still access the portal."

That is expected for already-onboarded users.

Fix:

- delete the user from Supabase Authentication

### "A user can log in, but the app does not behave correctly."

Check that the user has:

- a valid row in `auth.users`
- a matching row in `public.user_profiles`

## 12. Current seeded accounts in this project

At the moment, the project was seeded with:

- `sarthakbatra` as `admin`
- `demo` as `viewer`

If you do not want the `demo` account to exist as an invite, remove it from `public.allowed_users`.

## 13. Recommended operating checklist for Sarthak

When you take over the portal:

1. Complete your own first-time setup for `sarthakbatra`.
2. Change your password later from `Profile` if needed.
3. Confirm you have Supabase Dashboard access.
4. Decide whether to keep or remove the seeded `demo` viewer invite.
5. Add real users only through `public.allowed_users`.
6. Use `viewer` for dispatch-only people.
7. Use `admin` only for trusted staff who should be able to edit business data.

## 14. Recommended future improvement

The next useful feature to build is a simple in-app admin page for:

- creating invites
- changing roles
- disabling users safely
- resetting setup codes

That would remove the need to manage users directly in Supabase.
