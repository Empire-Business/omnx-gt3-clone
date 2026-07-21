# Deployment Guide

## Vercel Deployment

### Prerequisites
- A Vercel account (https://vercel.com)
- A Supabase project with the database set up

### Environment Variables

Configure these in your Vercel project settings:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon/public key |
| `VITE_SITE_URL` | Public URL of the deployed app, used in auth email redirects |

### Deployment Steps

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Log in to Vercel and click "New Project"
3. Import your repository
4. Vercel will auto-detect Vite - verify these settings:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Add the environment variables listed above
6. Click "Deploy"

### Preview Deployments

Vercel automatically creates preview deployments for:
- Every pull request
- Every branch push

This allows you to test changes before merging to production.

### Custom Domain

To add a custom domain:
1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Configure DNS records as instructed

### Troubleshooting

**Build fails with "Missing environment variables"**
- Ensure all required environment variables are set in Vercel

**Auth emails redirect to localhost**
- Set `VITE_SITE_URL` in Vercel to the production domain, for example `https://t3.empirebusiness.com.br`
- In Supabase Auth settings, add the same domain to `Site URL` and `Redirect URLs`
- Rebuild/redeploy the app after updating the environment variable

**404 errors on page refresh**
- The `vercel.json` rewrites configuration handles this for SPA routing

**API calls fail with CORS errors**
- Verify your Supabase project allows requests from your Vercel domain
