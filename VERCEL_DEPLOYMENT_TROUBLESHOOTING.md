# Vercel Deployment Troubleshooting Guide

If your app works locally but shows "Loading..." after signup on Vercel, follow these steps:

## Issue: App Stuck on "Loading..." After Signup

### Step 1: Check Environment Variables in Vercel

The most common cause is missing Supabase environment variables in Vercel.

1. **Go to your Vercel Dashboard**
   - Navigate to your project: https://vercel.com/dashboard
   - Click on your project
   - Go to **Settings** → **Environment Variables**

2. **Add Required Environment Variables**
   - Add the following variables:
     - `NEXT_PUBLIC_SUPABASE_URL` = Your Supabase project URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Your Supabase anon/public key

3. **Get Your Supabase Credentials**
   - Go to your Supabase Dashboard: https://supabase.com/dashboard
   - Select your project
   - Go to **Settings** → **API**
   - Copy:
     - **Project URL** → Use as `NEXT_PUBLIC_SUPABASE_URL`
     - **anon public** key → Use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. **Add Variables to Vercel**
   - In Vercel, click **Add New**
   - Enter the variable name and value
   - Select environment: **Production**, **Preview**, and **Development** (check all three)
   - Click **Save**

5. **Redeploy**
   - After adding environment variables, Vercel will automatically redeploy
   - Or manually trigger a redeploy: **Deployments** → Click the three dots → **Redeploy**

### Step 2: Verify Database Triggers

When a user signs up, a profile should be automatically created. Check if you have a database trigger set up:

1. **Go to Supabase Dashboard**
   - Navigate to **Database** → **Triggers**

2. **Check for Profile Creation Trigger**
   - There should be a trigger that creates a profile when a new user is created in `auth.users`
   - If missing, you'll need to create one (see database setup)

### Step 3: Check Vercel Logs

1. **View Function Logs**
   - In Vercel Dashboard, go to your deployment
   - Click on **Functions** tab
   - Check for any error messages

2. **View Runtime Logs**
   - Go to **Deployments** → Click on the latest deployment
   - Scroll down to see build and runtime logs
   - Look for any Supabase connection errors

### Step 4: Check Browser Console

1. **Open Developer Tools**
   - On your Vercel deployment, open the browser console (F12)
   - Look for JavaScript errors or network errors

2. **Check Network Tab**
   - Look for failed requests to Supabase
   - Check if requests are returning 401/403 errors (authentication issues)

### Step 5: Verify Supabase Configuration

1. **Check Supabase Redirect URLs**
   - Go to Supabase Dashboard → **Authentication** → **URL Configuration**
   - Add your Vercel URL to **Redirect URLs**:
     - `https://your-app.vercel.app/**`
     - `https://your-app.vercel.app/dashboard`
     - `https://your-app.vercel.app/login`
   - Also add if using preview deployments:
     - `https://your-app-*.vercel.app/**`

2. **Check Row Level Security (RLS)**
   - Ensure your `profiles` table has appropriate RLS policies
   - Users should be able to read/update their own profiles

### Step 6: Add Better Error Handling (Optional)

If errors are being silently swallowed, you might want to add error logging. Check the dashboard code to ensure errors are properly caught and logged.

### Step 7: Test the Fix

1. **Clear Browser Cache**
   - Clear your browser cache and cookies
   - Or use an incognito/private window

2. **Try Signing Up Again**
   - Create a new test account
   - Verify it works correctly

## Quick Checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set in Vercel environment variables
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in Vercel environment variables
- [ ] Environment variables are set for Production, Preview, and Development
- [ ] Vercel deployment has been redeployed after adding environment variables
- [ ] Supabase redirect URLs include your Vercel domain
- [ ] Database triggers are set up to create profiles on signup
- [ ] RLS policies allow users to access their profiles
- [ ] No errors in Vercel logs
- [ ] No errors in browser console

## Common Error Messages

### "Missing environment variable: NEXT_PUBLIC_SUPABASE_URL"
**Solution**: Add the environment variable in Vercel (see Step 1)

### "Invalid API key"
**Solution**: Double-check the anon key is correct and copied completely

### "Failed to fetch"
**Solution**: Check Supabase redirect URLs and RLS policies

### "Profile not found"
**Solution**: Check if database trigger exists to create profiles on user signup

## Need More Help?

1. Check Vercel's deployment logs for specific error messages
2. Check browser console for client-side errors
3. Verify your Supabase project is active and accessible
4. Test Supabase connection from a simple test page first
