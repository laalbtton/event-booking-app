# Database Migration Instructions for Supabase

This guide will help you run the `database_migrations.sql` file in your Supabase project.

## Method 1: Using Supabase Dashboard (Recommended)

### Step 1: Open Supabase Dashboard
1. Go to [https://supabase.com](https://supabase.com)
2. Sign in to your account
3. Select your project from the dashboard

### Step 2: Navigate to SQL Editor
1. In the left sidebar, click on **"SQL Editor"** (or go to: `https://supabase.com/dashboard/project/[your-project-id]/sql`)
2. You'll see a SQL editor interface

### Step 3: Create a New Query
1. Click the **"New query"** button (or use the `+` icon)
2. A new SQL editor tab will open

### Step 4: Copy and Paste the Migration
1. Open the `database_migrations.sql` file from your project
2. Copy **all** the SQL content (you can select all with Ctrl+A / Cmd+A)
3. Paste it into the SQL Editor in Supabase

### Step 5: Run the Migration
1. Click the **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)
2. Wait for the query to complete
3. You should see a success message: "Success. No rows returned"

### Step 6: Verify the Migration
1. Go to **"Table Editor"** in the left sidebar
2. Click on the `profiles` table
3. Verify that the new columns appear:
   - `bio`
   - `website_link`
   - `instagram_link`
   - `youtube_link`
   - `twitter_link`
4. Click on the `bookings` table
5. Verify that `attendance_status` column exists

## Method 2: Using Supabase CLI

### Prerequisites
- Install Supabase CLI: `npm install -g supabase`
- Login to Supabase: `supabase login`
- Link your project: `supabase link --project-ref [your-project-ref]`

### Run Migration
1. Open your terminal in the project directory
2. Run:
   ```bash
   supabase db push
   ```
   Or if you want to run the SQL file directly:
   ```bash
   supabase db execute -f database_migrations.sql
   ```

## Method 3: Using psql (PostgreSQL Command Line)

### Step 1: Get Connection String
1. In Supabase Dashboard, go to **Settings** → **Database**
2. Scroll down to **"Connection string"**
3. Copy the **"URI"** connection string
4. It will look like: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

### Step 2: Run Migration
```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" -f database_migrations.sql
```

Or connect interactively:
```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```
Then paste and run the SQL commands.

## Troubleshooting

### Error: "column already exists"
- This is normal if you've run the migration before
- The `IF NOT EXISTS` clause prevents errors, but you might see warnings
- The migration is safe to run multiple times

### Error: "permission denied"
- Make sure you're using the correct database credentials
- Check that you have admin access to your Supabase project

### Error: "function already exists"
- The `CREATE OR REPLACE FUNCTION` will update existing functions
- This is safe and expected behavior

## What the Migration Does

1. **Adds profile columns**: Adds `bio`, `website_link`, `instagram_link`, `youtube_link`, and `twitter_link` to the `profiles` table
2. **Adds attendance tracking**: Adds `attendance_status` column to the `bookings` table to track if users attended events
3. **Creates helper functions**: Creates two optional functions for querying attended events (the app uses direct queries, but these are available)

## After Migration

Once the migration is complete:
- ✅ Your application will be able to store and display user profiles with bio and social links
- ✅ Admins can mark event attendance in the attendance management page
- ✅ Users can see their attended events on their profile
- ✅ Public profiles will display social links and attended events

## Need Help?

If you encounter any issues:
1. Check the Supabase Dashboard → Logs for error messages
2. Verify your database connection settings
3. Ensure you have the correct permissions on your Supabase project
