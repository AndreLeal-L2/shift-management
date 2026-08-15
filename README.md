# RellenoShifts - Deployment Guide

This guide will help you deploy RellenoShifts with a free Supabase database and Vercel hosting.

## Prerequisites
- GitHub account
- Supabase account (free)
- Vercel account (free)

## Step 1: Set up Supabase Database

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in project details:
   - **Name**: relleno-shifts
   - **Database Password**: (generate a strong password, save it!)
   - **Region**: Choose closest to your users
4. Wait for project to be created (2-3 minutes)

## Step 2: Create Database Tables

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the contents of `schema.sql` and paste it
4. Click "Run" to create the tables

## Step 3: Get Supabase Credentials

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like: https://xyz.supabase.co)
   - **anon/public key** (starts with `eyJhbGci...`)

## Step 4: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from your project directory:
   ```bash
   cd /Users/AndreLeal_1/Desktop/FoodZ
   vercel
   ```

4. Follow the prompts:
   - **Set up and deploy?** Yes
   - **Scope**: Select your account
   - **Link to existing project?** No
   - **Project name**: relleno-shifts
   - **Directory**: . (current directory)

5. Add environment variables when prompted:
   - **NEXT_PUBLIC_SUPABASE_URL**: Your Supabase project URL
   - **NEXT_PUBLIC_SUPABASE_ANON_KEY**: Your Supabase anon key

6. Deploy to production:
   ```bash
   vercel --prod
   ```

### Option B: Using Vercel Dashboard

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign up/login
3. Click "Add New Project"
4. Import your GitHub repository
5. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: ./
   - **Build Command**: (leave empty)
   - **Output Directory**: ./
6. Add environment variables:
   - Go to Settings → Environment Variables
   - Add `NEXT_PUBLIC_SUPABASE_URL` with your Supabase URL
   - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` with your Supabase anon key
7. Click "Deploy"

## Step 5: Seed Initial Data (Optional)

Your existing employees in `script.js` need to be added to the database. You can:

1. Use the Supabase dashboard **Table Editor** to manually add employees
2. Or use the API after deployment by logging into your app and using the UI

## Step 6: Test Your Deployment

1. Visit your Vercel deployment URL
2. Login with: admin@relleno.pt / admin123
3. Test adding employees
4. Test saving sales history
5. Verify data persists across browser sessions

## Environment Variables Reference

Create a `.env` file locally for development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Local Development

To test locally with the database:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file with your Supabase credentials

3. Run Vercel dev server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## API Endpoints

- `GET/POST /api/auth` - Authentication
- `GET/POST /api/employees` - Employee management
- `GET/POST /api/sales` - Sales history

## Troubleshooting

**CORS errors**: Ensure your API endpoints have CORS headers (already included in the code)

**Database connection errors**: 
- Verify Supabase credentials in environment variables
- Check Supabase project is active (not paused)

**Deployment fails**:
- Ensure `package.json` and `vercel.json` are in the root
- Check Vercel logs for specific errors

## Cost

- **Supabase**: Free tier (500MB database, 1GB bandwidth)
- **Vercel**: Free tier (100GB bandwidth, unlimited deployments)

Both are sufficient for this application.
