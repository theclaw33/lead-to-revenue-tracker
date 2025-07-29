# 🚀 GitHub Integration Setup Guide

Your Lead-to-Revenue Tracker is ready for GitHub! Follow these steps to complete the automatic push/pull setup.

## ✅ Already Completed
- ✅ Git repository initialized with all serverless code
- ✅ Initial commit created with complete project
- ✅ SSH key generated and added to SSH agent
- ✅ Branch renamed to `main`

## 🔧 Next Steps (Manual - 5 minutes)

### Step 1: Add SSH Key to GitHub

1. **Copy your SSH public key** (already generated):
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK1UMizVAEVzxdwTPZSbqK2jbSzJp17AULEm3+vEEu9g lindsaygonzales@example.com
   ```

2. **Go to GitHub.com** → Profile picture → Settings → SSH and GPG keys

3. **Click "New SSH key"**
   - Title: `Lead-to-Revenue Tracker (Mac)`
   - Key: Paste the SSH key from above
   - Click "Add SSH key"

### Step 2: Create GitHub Repository

1. **Go to GitHub.com** → Click "+" → "New repository"

2. **Repository settings:**
   - Repository name: `lead-to-revenue-tracker`
   - Description: `Serverless Node.js automation connecting HouseCall Pro → Airtable → QuickBooks for lead tracking`
   - Visibility: **Public** (recommended) or Private
   - **DO NOT** check "Add a README file" (we already have one)

3. **Click "Create repository"**

### Step 3: Connect Local Repository (Run These Commands)

After creating the GitHub repository, replace `yourusername` with your actual GitHub username:

```bash
# Navigate to project directory (if not already there)
cd /Users/lindsaygonzales/Desktop/Projects/lead-to-revenue-tracker

# Add GitHub as remote origin (replace yourusername!)
git remote add origin git@github.com:theclaw33/lead-to-revenue-tracker.git

# Push to GitHub
git push -u origin main
```

## 🔄 Automatic Push/Pull Commands

Once connected, you can use these commands for automatic updates:

```bash
# Push changes to GitHub
git add .
git commit -m "Update: your change description"
git push

# Pull latest changes from GitHub  
git pull

# Check repository status
git status

# View commit history
git log --oneline -10
```

## 🚀 Automatic Deployment Setup

After GitHub is connected:

### For Netlify Deployment:
1. **Go to Netlify.com** → "Add new site" → "Import an existing project"
2. **Connect your GitHub account** and select `lead-to-revenue-tracker`
3. **Build settings** are auto-detected from `netlify.toml`
4. **Add environment variables** in Netlify dashboard (from .env file)
5. **Deploy!** - Future Git pushes will auto-deploy

### Environment Variables for Netlify:
```env
AIRTABLE_API_KEY=patykEJ97yTfLaOLi.2b37309baf4fae39cf2426bef276b9fc67fe695e745db0fcccef936a1fb46e9d
AIRTABLE_BASE_ID=appxYZF1D0Hq44EKw
AIRTABLE_LEADS_TABLE_NAME=HCP Leads
QBO_CLIENT_ID=ABZrV595pwlAy340OkQmQBs6AcK8QHdUQ4Re2rSC0rrUvKfEVq
QBO_CLIENT_SECRET=qFm6ZZSi2uiRQ7jxR5AFbWZDimEZR5MQR8uHqzoO
QBO_SANDBOX=true
QBO_REDIRECT_URI=https://your-site.netlify.app/.netlify/functions/auth-quickbooks/callback
FUZZY_MATCH_THRESHOLD=0.8
NODE_ENV=production
```

## 🛡️ Security Features

### Branch Protection (Recommended):
1. **GitHub repo** → Settings → Branches
2. **Add rule** for `main` branch:
   - ✅ Require pull request reviews
   - ✅ Require status checks (if using CI/CD)
   - ✅ Include administrators

### Automatic Sync Script:
Save this as `sync.sh` for easy updates:
```bash
#!/bin/bash
echo "🔄 Syncing with GitHub..."
git add .
git commit -m "Auto-sync: $(date)"
git push
echo "✅ Pushed to GitHub!"
git pull
echo "✅ Synced with remote!"
```

## ✅ Verification Steps

After setup, verify everything works:

```bash
# Test SSH connection
ssh -T git@github.com

# Check remote configuration  
git remote -v

# Test push/pull
echo "test" > test.txt
git add test.txt
git commit -m "Test commit"
git push
git pull
rm test.txt
```

## 🎯 Success Indicators

You'll know it's working when:
- ✅ `git push` uploads changes to GitHub instantly
- ✅ GitHub shows your complete project with all serverless functions
- ✅ Netlify auto-deploys when you push commits
- ✅ `git pull` downloads any changes made via GitHub web interface

---

🎉 **Once complete, your Lead-to-Revenue Tracker will have full GitHub integration with automatic deployment capabilities!**