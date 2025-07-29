#!/bin/bash

# 🧪 GitHub Connection Test Script
# Tests your GitHub SSH connection and repository setup

echo "🧪 Testing GitHub Connection..."
echo "================================"

# Test 1: SSH Connection
echo "1️⃣  Testing SSH connection to GitHub..."
if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo "✅ SSH connection to GitHub working!"
else
    echo "❌ SSH connection failed. Check your SSH key setup."
    echo "💡 Run: cat ~/.ssh/id_ed25519.pub"
    echo "   Then add this key to GitHub → Settings → SSH Keys"
    exit 1
fi

# Test 2: Git Remote Configuration
echo ""
echo "2️⃣  Checking Git remote configuration..."
if git remote get-url origin > /dev/null 2>&1; then
    REMOTE_URL=$(git remote get-url origin)
    echo "✅ Remote origin configured: $REMOTE_URL"
    
    if [[ $REMOTE_URL == git@github.com:* ]]; then
        echo "✅ Using SSH (recommended for automatic push/pull)"
    elif [[ $REMOTE_URL == https://github.com/* ]]; then
        echo "⚠️  Using HTTPS - you'll need to enter credentials for each push"
        echo "💡 Consider switching to SSH: git remote set-url origin git@github.com:username/lead-to-revenue-tracker.git"
    fi
else
    echo "❌ No remote origin configured"
    echo "💡 Run: git remote add origin git@github.com:username/lead-to-revenue-tracker.git"
    exit 1
fi

# Test 3: Repository Status
echo ""
echo "3️⃣  Checking repository status..."
BRANCH=$(git branch --show-current)
echo "📍 Current branch: $BRANCH"

COMMITS=$(git rev-list --count HEAD 2>/dev/null || echo "0")
echo "📊 Total commits: $COMMITS"

if git diff --quiet && git diff --staged --quiet; then
    echo "✅ Working directory clean"
else
    echo "⚠️  You have uncommitted changes"
    git status --short
fi

# Test 4: Test Push/Pull (if requested)
echo ""
echo "4️⃣  Connection test complete!"

if [[ "$1" == "full" ]]; then
    echo ""
    echo "🚀 Running full test with test commit..."
    
    # Create test file
    echo "Test connection $(date)" > .github-test
    git add .github-test
    git commit -m "Test: GitHub connection verification"
    
    echo "📤 Testing push..."
    if git push; then
        echo "✅ Push successful!"
        
        echo "📥 Testing pull..."
        if git pull; then
            echo "✅ Pull successful!"
        else
            echo "❌ Pull failed"
        fi
        
        # Clean up test file
        git rm .github-test
        git commit -m "Cleanup: Remove GitHub connection test file"
        git push
        
        echo "✅ Full GitHub integration test passed!"
    else
        echo "❌ Push failed - check your repository permissions"
    fi
fi

echo ""
echo "🎉 GitHub setup verification complete!"
echo ""
echo "💡 Quick commands:"
echo "  ./deploy.sh push \"Your commit message\"  - Push changes"
echo "  ./deploy.sh pull                        - Pull updates"  
echo "  ./deploy.sh sync                        - Push then pull"
echo "  ./test-github.sh full                   - Run full connection test"