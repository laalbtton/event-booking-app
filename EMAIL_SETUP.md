# Email Notifications Setup Guide

This guide will help you set up email notifications for your event booking app using Resend.

## Overview

The app sends email notifications for:
- ✅ **Booking Confirmations** - When a user successfully books an event
- 🎉 **Waitlist Promotions** - When a user is promoted from waitlist to confirmed
- 📊 **Waitlist Position Updates** - When a user's waitlist position improves significantly
- ❌ **Booking Cancellations** - When a user cancels a booking (with refund status)

## Step 1: Sign Up for Resend

1. Go to [Resend.com](https://resend.com)
2. Sign up for a free account (100 emails/day free tier)
3. Verify your email address

## Step 2: Create an API Key

1. In Resend Dashboard, go to **API Keys**
2. Click **Create API Key**
3. Give it a name (e.g., "Event Booking App")
4. Copy the API key (you'll only see it once!)

## Step 3: Verify Your Domain (Recommended for Production)

For production, you should verify your domain:

1. Go to **Domains** in Resend Dashboard
2. Click **Add Domain**
3. Enter your domain (e.g., `laalbutton.com`)
4. Add the DNS records provided by Resend to your domain's DNS settings
5. Wait for verification (usually takes a few minutes)

**Note:** For development/testing, you can use Resend's test domain without verification.

## Step 4: Set Up Environment Variables

Environment variables store sensitive configuration data (like API keys) outside of your code. This keeps them secure and allows different values for development and production.

### Step 4.1: Local Development Setup (.env.local)

1. **Create the environment file:**
   - In your project root directory (same level as `package.json`), create a new file named `.env.local`
   - If the file already exists, open it

2. **Add the following variables:**
   ```bash
   RESEND_API_KEY=re_your_api_key_here
   RESEND_FROM_EMAIL=noreply@laalbutton.com
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. **Replace the placeholder values:**
   - **RESEND_API_KEY**: Replace `re_your_api_key_here` with the API key you copied from Resend Dashboard (Step 2)
     - Example: `RESEND_API_KEY=re_123456789abcdefghijklmnop`
   - **RESEND_FROM_EMAIL**: 
     - For development/testing: Use Resend's test domain: `onboarding@resend.dev`
     - For production: Use your verified domain email (e.g., `noreply@laalbutton.com`)
   - **NEXT_PUBLIC_APP_URL**: 
     - For local development: `http://localhost:3000` (or whatever port your Next.js app runs on)
     - This is used to generate links in emails

4. **Save the file** - Make sure it's saved as `.env.local` (with the dot at the beginning)

5. **Verify the file is ignored by git:**
   - Check that `.env.local` is in your `.gitignore` file
   - This prevents accidentally committing your API keys to version control
   - If `.gitignore` doesn't exist, create it and add: `.env.local`

6. **Restart your development server:**
   - Stop your Next.js dev server (Ctrl+C or Cmd+C)
   - Run `npm run dev` again
   - Environment variables are only loaded when the server starts

**Example `.env.local` file:**
```bash
# Resend Email Service Configuration
RESEND_API_KEY=re_AbCdEf1234567890GhIjKlMnOpQrStUvWxYz
RESEND_FROM_EMAIL=onboarding@resend.dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4.2: Production Setup (Vercel)

1. **Navigate to Vercel Dashboard:**
   - Go to [vercel.com](https://vercel.com) and log in
   - Click on your project name (or create a new project if you haven't deployed yet)

2. **Access Environment Variables:**
   - In your project dashboard, click on the **Settings** tab (top navigation)
   - In the left sidebar, click on **Environment Variables**

3. **Add Each Variable:**
   
   **Variable 1: RESEND_API_KEY**
   - Click **Add New** button
   - **Key**: `RESEND_API_KEY`
   - **Value**: Paste your Resend API key (the one you copied in Step 2)
   - **Environment**: Check all three boxes:
     - ☑️ Production
     - ☑️ Preview
     - ☑️ Development
   - Click **Save**

   **Variable 2: RESEND_FROM_EMAIL**
   - Click **Add New** button again
   - **Key**: `RESEND_FROM_EMAIL`
   - **Value**: 
     - For testing: `onboarding@resend.dev`
     - For production: `noreply@laalbutton.com` (or your verified domain email)
   - **Environment**: Check all three boxes (Production, Preview, Development)
   - Click **Save**

   **Variable 3: NEXT_PUBLIC_APP_URL**
   - Click **Add New** button again
   - **Key**: `NEXT_PUBLIC_APP_URL`
   - **Value**: Your production URL (e.g., `https://app.laalbutton.com`)
   - **Environment**: Check all three boxes
   - Click **Save**

4. **Verify All Variables Are Added:**
   - You should see all three variables listed:
     - `RESEND_API_KEY`
     - `RESEND_FROM_EMAIL`
     - `NEXT_PUBLIC_APP_URL`
   - Each should have checkmarks for Production, Preview, and Development

5. **Redeploy Your Application:**
   - Environment variables are only loaded during build/deployment
   - Go to the **Deployments** tab
   - Click the three dots (⋯) on your latest deployment
   - Click **Redeploy**
   - Or push a new commit to trigger a new deployment

**Important Notes:**
- ⚠️ **Never commit `.env.local` to git** - It contains sensitive API keys
- 🔄 **Restart required**: After adding/changing environment variables, you must restart your dev server or redeploy
- 🔒 **Security**: Environment variables in Vercel are encrypted and only accessible server-side
- 📝 **Naming**: `NEXT_PUBLIC_` prefix makes the variable available in browser code (use sparingly)

### Step 4.3: Verify Environment Variables Are Loaded

**For Local Development:**
1. Add a temporary console log in `lib/email.ts` (remove after testing):
   ```typescript
   console.log('Resend API Key exists:', !!process.env.RESEND_API_KEY)
   ```
2. Restart your dev server
3. Check the terminal output - should show `true`

**For Production:**
1. Check Vercel deployment logs during build
2. Look for any errors related to missing environment variables
3. Test by making a booking and checking if email is sent

## Step 5: Install Dependencies

The email service uses the native `fetch` API available in Node.js 18+ and modern browsers, so **no additional npm packages are required**.

### Step 5.1: Verify Node.js Version

1. **Check your Node.js version:**
   ```bash
   node --version
   ```
   - Should be v18.0.0 or higher
   - If lower, update Node.js from [nodejs.org](https://nodejs.org)

2. **Verify fetch is available:**
   - The `fetch` API is built into Node.js 18+
   - No need to install `node-fetch` or similar packages

### Step 5.2: No Installation Required

Since we're using the native `fetch` API, you can skip `npm install`. The email functionality will work out of the box once environment variables are set.

**If you want to use a different email service:**
- **SendGrid**: `npm install @sendgrid/mail`
- **AWS SES**: `npm install @aws-sdk/client-ses`
- **Nodemailer**: `npm install nodemailer`
- Then modify `lib/email.ts` to use the new service

## Step 6: Test Email Sending

Testing ensures your email integration is working correctly before users start receiving emails.

### Step 6.1: Test Booking Confirmation Email

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Open your app in browser:**
   - Navigate to `http://localhost:3000`
   - Log in to your account

3. **Make a test booking:**
   - Go to the dashboard
   - Find an available event
   - Click "Book Event"
   - Complete the booking process

4. **Check for email:**
   - Open your email inbox (the email associated with your test account)
   - Check the **Spam/Junk** folder if not in inbox
   - You should receive a booking confirmation email within a few seconds

5. **Verify email content:**
   - Email should have subject: "Booking Confirmed: [Event Name]"
   - Should contain event details (date, time, location)
   - Should have a "View Event Details" button/link

### Step 6.2: Check Browser Console

1. **Open Developer Tools:**
   - Press `F12` or `Right-click → Inspect`
   - Go to the **Console** tab

2. **Look for errors:**
   - If email sending fails, you'll see warnings like:
     ```
     Failed to send booking confirmation email: [error message]
     ```
   - These are non-blocking (booking still succeeds)

3. **Common errors to watch for:**
   - `RESEND_API_KEY is not set` → Environment variable not loaded
   - `401 Unauthorized` → Invalid API key
   - `403 Forbidden` → Domain not verified (for production)

### Step 6.3: Check Resend Dashboard Logs

1. **Navigate to Resend Dashboard:**
   - Go to [resend.com](https://resend.com) and log in
   - Click on **Logs** in the left sidebar

2. **View email delivery status:**
   - You'll see a list of all emails sent
   - Status indicators:
     - ✅ **Delivered** - Email successfully sent
     - ⏳ **Pending** - Email queued for delivery
     - ❌ **Failed** - Email failed to send (click to see error)

3. **Check email details:**
   - Click on any email in the logs
   - See recipient, subject, timestamp
   - View the actual email content (HTML preview)

### Step 6.4: Test Other Email Types

**Test Waitlist Promotion:**
1. Book an event that's already full (joins waitlist)
2. Cancel another user's confirmed booking for that event
3. You should receive a waitlist promotion email

**Test Cancellation Email:**
1. Book an event
2. Cancel the booking (from dashboard)
3. Check for cancellation email with refund information

**Test Waitlist Position Update:**
1. Join a waitlist
2. Have multiple people cancel ahead of you
3. When your position improves by 3+ spots, you'll receive an email

### Step 6.5: Verify Email Links Work

1. **Click links in test emails:**
   - "View Event Details" button should open the event page
   - Links should use your `NEXT_PUBLIC_APP_URL` value

2. **Test in different environments:**
   - Local: Links should point to `http://localhost:3000`
   - Production: Links should point to your production URL

### Step 6.6: Common Testing Issues

**Email not received:**
- ✅ Check Spam/Junk folder
- ✅ Verify email address in your profile is correct
- ✅ Check Resend Dashboard → Logs for delivery status
- ✅ Verify `RESEND_FROM_EMAIL` is set correctly

**Email received but links broken:**
- ✅ Check `NEXT_PUBLIC_APP_URL` is set correctly
- ✅ Verify the URL is accessible (not localhost in production)
- ✅ Check that the event/booking IDs in URLs are valid

**Console shows errors:**
- ✅ Verify all environment variables are set
- ✅ Restart dev server after adding env variables
- ✅ Check API key is valid (not expired/revoked)
- ✅ Verify domain is verified in Resend (for production)

## Email Templates

All email templates are defined in `lib/email.ts` and can be customized:

- `getBookingConfirmationEmail()` - Booking confirmation template
- `getWaitlistPromotionEmail()` - Waitlist promotion template
- `getBookingCancellationEmail()` - Cancellation template
- `getWaitlistPositionEmail()` - Waitlist position update template

## How It Works

1. **Booking Confirmation**: When a user books an event, `sendBookingConfirmationEmail()` is called
2. **Waitlist Promotion**: When a user is promoted from waitlist, `sendWaitlistPromotionEmail()` is called via the real-time subscription handler
3. **Cancellation**: When a user cancels, `sendBookingCancellationEmail()` is called
4. **Waitlist Position**: When position improves significantly (3+ spots), `sendWaitlistPositionEmail()` is called

All email sending is **non-blocking** - if an email fails to send, it won't break the booking flow. Errors are logged to the console.

## Step 9: Troubleshooting

### Step 9.1: Emails Not Sending

**Symptom:** No emails received, no errors visible

**Diagnosis Steps:**

1. **Verify API Key:**
   ```bash
   # In your terminal (local development)
   echo $RESEND_API_KEY
   # Should show your API key (not empty)
   ```
   - If empty, check `.env.local` file exists and has the key
   - Restart dev server after adding env variables
   - In Vercel: Check Settings → Environment Variables

2. **Check From Email:**
   - Development: Must be `onboarding@resend.dev` (Resend's test domain)
   - Production: Must be from your verified domain (e.g., `noreply@laalbutton.com`)
   - Unverified domains will cause emails to fail

3. **Check Resend Dashboard Logs:**
   - Go to Resend Dashboard → **Logs**
   - Look for your email attempts
   - Click on failed emails to see error messages
   - Common errors:
     - `401 Unauthorized` → Invalid API key
     - `403 Forbidden` → Domain not verified
     - `422 Unprocessable Entity` → Invalid email format

4. **Check Browser Console:**
   - Open DevTools (F12) → Console tab
   - Look for warnings like: `Failed to send booking confirmation email`
   - Check Network tab for failed API requests to `/api/send-email`

5. **Check Server Logs (Vercel):**
   - Go to Vercel Dashboard → Your Project → **Logs**
   - Look for errors during deployment or runtime
   - Check Function Logs for API route errors

**Quick Fixes:**
- ✅ Restart dev server: `npm run dev`
- ✅ Redeploy on Vercel after adding env variables
- ✅ Verify API key hasn't been revoked in Resend Dashboard
- ✅ Check `.env.local` is in project root (not in a subfolder)

### Step 9.2: Email Going to Spam

**Symptom:** Emails received but in Spam/Junk folder

**Solutions:**

1. **Verify Your Domain:**
   - Go to Resend Dashboard → **Domains**
   - Add your domain (e.g., `laalbutton.com`)
   - Add DNS records provided by Resend to your domain's DNS settings
   - Wait for verification (usually 5-15 minutes)

2. **Set Up SPF Record:**
   - Resend provides SPF record: `v=spf1 include:resend.com ~all`
   - Add as TXT record in your DNS: `@` or root domain
   - Helps email servers verify sender authenticity

3. **Set Up DKIM:**
   - Resend provides DKIM records (usually 3 CNAME records)
   - Add all provided CNAME records to your DNS
   - Helps prevent email spoofing

4. **Use Verified From Address:**
   - Always use email from your verified domain
   - Don't use `onboarding@resend.dev` in production
   - Format: `noreply@yourdomain.com` or `hello@yourdomain.com`

5. **Warm Up Your Domain:**
   - Start with low email volume
   - Gradually increase over days/weeks
   - High initial volume can trigger spam filters

6. **Email Content Best Practices:**
   - Avoid spam trigger words: "FREE", "URGENT", excessive exclamation marks
   - Include unsubscribe link (if sending marketing emails)
   - Don't use URL shorteners
   - Include plain text version

**Check Email Reputation:**
- Use tools like [Mail-Tester.com](https://www.mail-tester.com)
- Send test email to their address
- Get spam score and recommendations

### Step 9.3: Rate Limits

**Resend Free Tier Limits:**
- 100 emails per day
- 3,000 emails per month
- No credit card required

**What Happens When Limit Reached:**
- Emails will fail to send
- Resend API returns error: `429 Too Many Requests`
- Check Resend Dashboard → **Usage** to see current usage

**Solutions:**

1. **Monitor Usage:**
   - Resend Dashboard → **Usage** shows daily/monthly counts
   - Set up alerts when approaching limits

2. **Upgrade Plan:**
   - Go to Resend Dashboard → **Billing**
   - Upgrade to Pro plan ($20/month for 50,000 emails)
   - Or pay-as-you-go for higher volumes

3. **Optimize Email Sending:**
   - Only send critical emails (confirmations, promotions)
   - Batch non-urgent notifications
   - Consider in-app notifications for less critical updates

4. **Implement Queue System:**
   - Queue emails during high traffic
   - Send in batches to stay under limits
   - Use background job processor (e.g., Bull, BullMQ)

### Step 9.4: Other Common Issues

**Issue: "RESEND_API_KEY is not set"**

**Solution:**
- Check `.env.local` file exists in project root
- Verify variable name is exactly `RESEND_API_KEY` (case-sensitive)
- Restart dev server after adding env variables
- In Vercel: Ensure variable is added to all environments

**Issue: "Invalid email address"**

**Solution:**
- Verify user's email in Supabase `profiles` table is valid
- Check email format (should have @ and valid domain)
- Test with a known good email address

**Issue: "Links in emails point to localhost in production"**

**Solution:**
- Check `NEXT_PUBLIC_APP_URL` in Vercel environment variables
- Should be your production URL: `https://app.laalbutton.com`
- Redeploy after updating

**Issue: "Emails work locally but not in production"**

**Solution:**
- Verify environment variables are set in Vercel (not just locally)
- Check Vercel deployment logs for errors
- Ensure domain is verified in Resend (for production)
- Use production email address (not `onboarding@resend.dev`)

**Issue: "Email template looks broken"**

**Solution:**
- Check HTML is valid (use HTML validator)
- Ensure all CSS is inline (not in `<style>` tags)
- Test in multiple email clients
- Use email testing tools like Litmus or Email on Acid

## Alternative Email Services

If you prefer a different email service, you can modify `lib/email.ts`:

- **SendGrid**: Similar API, replace fetch URL and headers
- **AWS SES**: Use AWS SDK
- **Mailgun**: Similar API structure
- **Supabase Email**: If using Supabase Edge Functions

## Production Checklist

- [ ] Resend account created
- [ ] API key generated and added to environment variables
- [ ] Domain verified in Resend
- [ ] SPF/DKIM records added to DNS
- [ ] Environment variables set in Vercel
- [ ] Test emails sent and received
- [ ] Email templates customized (optional)
- [ ] Monitoring set up (Resend Dashboard)

## Support

For issues with:
- **Resend**: Check [Resend Documentation](https://resend.com/docs)
- **Email Templates**: Edit `lib/email.ts`
- **Integration**: Check `lib/emailService.ts` and `app/dashboard/page.tsx`
