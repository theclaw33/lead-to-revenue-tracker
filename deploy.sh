#!/bin/bash

# 🚀 Lead-to-Revenue Tracker - Quick Deploy Script
# This script automates the common Git operations for your project

set -e  # Exit on any error

echo "🚀 Lead-to-Revenue Tracker - Deploy Script"
echo "==========================================="

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Check if remote origin exists
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "⚠️  No GitHub remote configured yet"
    echo "📖 Please follow the setup guide in github-setup.md first"
    exit 1
fi

# Function to commit and push changes
commit_and_push() {
    local message="$1"
    
    # Check if there are changes to commit
    if git diff --quiet && git diff --staged --quiet; then
        echo "✅ No changes to commit"
    else
        echo "📝 Staging changes..."
        git add .
        
        echo "💾 Committing changes..."
        git commit -m "$message"
        
        echo "🚀 Pushing to GitHub..."
        git push
        
        echo "✅ Successfully deployed to GitHub!"
    fi
}

# Function to pull latest changes
pull_updates() {
    echo "⬇️  Pulling latest changes from GitHub..."
    git pull
    echo "✅ Updated with latest changes!"
}

# Function to check status
check_status() {
    echo "📊 Repository Status:"
    echo "-------------------"
    git status --short
    echo ""
    echo "📈 Recent commits:"
    git log --oneline -5
}

# Main script logic
case "${1:-status}" in
    "push"|"deploy")
        message="${2:-Auto-deploy: $(date '+%Y-%m-%d %H:%M:%S')}"
        commit_and_push "$message"
        ;;
    "pull"|"update")
        pull_updates
        ;;
    "sync")
        commit_and_push "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S')"
        pull_updates
        ;;
    "status")
        check_status
        ;;
    "help"|"-h"|"--help")
        echo "Usage: ./deploy.sh [command] [message]"
        echo ""
        echo "Commands:"
        echo "  push|deploy [message]  - Commit and push changes (default message: timestamp)"
        echo "  pull|update           - Pull latest changes from GitHub"
        echo "  sync                  - Push local changes then pull remote changes"
        echo "  status                - Show repository status and recent commits"
        echo "  help                  - Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./deploy.sh push \"Added new webhook feature\""
        echo "  ./deploy.sh sync"
        echo "  ./deploy.sh pull"
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo "Run './deploy.sh help' for usage information"
        exit 1
        ;;
esac