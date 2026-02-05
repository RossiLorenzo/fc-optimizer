#!/bin/bash

# FC SBC Optimizer - Deploy Script
# This script deploys the app to GitHub and Heroku

set -e

echo "🚀 FC SBC Optimizer - Deployment Script"
echo "========================================"

# Configuration - Update these values
GITHUB_REPO=${GITHUB_REPO:-""}
HEROKU_APP=${HEROKU_APP:-""}

# Check if configuration is set
if [ -z "$GITHUB_REPO" ]; then
    echo "⚠️  GITHUB_REPO environment variable is not set."
    echo "   Set it with: export GITHUB_REPO=your-username/fc-sbc-optimizer"
    echo "   Or edit this script directly."
    read -p "Enter GitHub repo (username/repo-name): " GITHUB_REPO
fi

if [ -z "$HEROKU_APP" ]; then
    echo "⚠️  HEROKU_APP environment variable is not set."
    echo "   Set it with: export HEROKU_APP=your-heroku-app-name"
    read -p "Enter Heroku app name: " HEROKU_APP
fi

# Build the project
echo ""
echo "📦 Building the project..."
npm run build

# Initialize git if not already done
if [ ! -d ".git" ]; then
    echo ""
    echo "🔧 Initializing git repository..."
    git init
fi

# Add all files and commit
echo ""
echo "📝 Committing changes..."
git add -A
git commit -m "Deploy: $(date +'%Y-%m-%d %H:%M:%S')" || echo "No changes to commit"

# Add GitHub remote if not exists
if ! git remote | grep -q "origin"; then
    echo ""
    echo "🔗 Adding GitHub remote..."
    git remote add origin "https://github.com/${GITHUB_REPO}.git"
fi

# Push to GitHub
echo ""
echo "📤 Pushing to GitHub..."
git push -u origin main || git push -u origin master

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo ""
    echo "❌ Heroku CLI is not installed."
    echo "   Install it from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Login to Heroku if not logged in
echo ""
echo "🔐 Checking Heroku authentication..."
heroku auth:whoami || heroku login

# Add Heroku remote if not exists
if ! git remote | grep -q "heroku"; then
    echo ""
    echo "🔗 Adding Heroku remote..."
    heroku git:remote -a "$HEROKU_APP"
fi

# Set Heroku buildpacks if not set
echo ""
echo "🛠️  Checking Heroku buildpack..."
heroku buildpacks:set heroku/nodejs -a "$HEROKU_APP" 2>/dev/null || echo "Buildpack already set"

# Deploy to Heroku
echo ""
echo "🚀 Deploying to Heroku..."
git push heroku main || git push heroku master

# Open the app
echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌍 Your app is now live at: https://${HEROKU_APP}.herokuapp.com"
echo ""

read -p "Open in browser? (y/n): " OPEN_BROWSER
if [ "$OPEN_BROWSER" = "y" ] || [ "$OPEN_BROWSER" = "Y" ]; then
    heroku open
fi
