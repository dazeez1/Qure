# Branch Protection Setup Guide

This guide will help you set up branch protection rules so that only PRs with passing CI checks can be merged to `main`.

## Step-by-Step Instructions

### 1. Go to Repository Settings
1. Navigate to your repository: `https://github.com/dazeez1/Qure`
2. Click on **Settings** (top menu bar)
3. Click on **Branches** (left sidebar)

### 2. Add Branch Protection Rule
1. Under **Branch protection rules**, click **Add rule** or **Add branch protection rule**
2. In the **Branch name pattern** field, enter: `main`
3. Configure the following settings:

### 3. Required Settings (Recommended)

#### ✅ **Require a pull request before merging**
- Check this box
- **Required number of approvals before merging**: `1` (or more if you want)
- **Dismiss stale pull request approvals when new commits are pushed**: ✅ Checked

#### ✅ **Require status checks to pass before merging**
- Check this box
- **Require branches to be up to date before merging**: ✅ Checked
- Under **Status checks that are required**, select:
  - ✅ `Frontend Lint & Build` (this is your CI job name)

#### ✅ **Require conversation resolution before merging**
- Check this box (optional but recommended)
- Ensures all comments are addressed before merging

#### ✅ **Do not allow bypassing the above settings**
- Check this box (recommended)
- Prevents admins from bypassing protection rules

### 4. Optional but Recommended Settings

#### ✅ **Require linear history**
- Check this box
- Prevents merge commits, keeps history clean

#### ✅ **Include administrators**
- Check this box
- Even admins must follow the rules

#### ✅ **Restrict who can push to matching branches**
- Optional: Only allow specific people/teams to push directly to main

### 5. Save the Rule
- Click **Create** or **Save changes** at the bottom

## What This Does

Once configured:
- ✅ PRs can only be merged if CI checks pass
- ✅ PRs must be up to date with main
- ✅ At least one approval required (if you set it)
- ✅ No direct pushes to main (must go through PRs)
- ✅ Clean git history maintained

## Testing the Protection

1. Create a test PR with failing checks
2. Try to merge it - it should be blocked
3. Fix the checks
4. Try to merge again - it should work

## Current CI Checks

Your workflow runs these checks:
- ✅ Frontend Lint & Build (includes lint, build, and validation)

## Need Help?

If you need to temporarily bypass (not recommended), you can:
- Temporarily disable the rule in Settings
- Or merge via command line (if you have admin access and bypass is allowed)

---

**Note**: These settings ensure code quality and prevent broken code from reaching main.

