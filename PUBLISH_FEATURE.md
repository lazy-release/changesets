There should be a new command for "publish". This command should...
1. Go through all the package.json files.
2. Grab the version
3. Create and push git tags in the format package-name@version. Skip this step if the tag already exists on the remote
4. Publish the packages to npm in each package directory run npm install or pnpm install or bun install depending on what package manager the user is using. Skip publishing to npm if the package.json contains "private": true
5. Create GitHub Release - Check the last commit get all the changeset files that were deleted under .changesets/*.md. Create a GitHub release for each package using the tag that was created in step 3. The markdown in the GitHub release should be formatted like this

# @scope/package-name

## 0.1.0

### 🚀 feat
- Description
