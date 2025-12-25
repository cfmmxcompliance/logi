# Deployment Plan

To deploy the updates to the cloud so they are accessible on the web, we will use **Firebase Hosting**.

## 1. Verify Build
First, we must ensure the application builds successfully for production.
- **Command**: `npm run build`
- **Output**: This creates a `dist/` folder containing the optimized application.

## 2. Configure Hosting (One-Time Setup)
We need to tell Firebase that this is a web application and where the files are located.

> [!NOTE]
> creating a `firebase.json` file is required. I can create this for you automatically.

**Configuration Details**:
- **Public Directory**: `dist` (This is where Vite puts the build files)
- **Single Page App**: `true` (This ensures routing works correctly)

## 3. Deploy
Once configured, deployment is a single command.
- **Command**: `npx firebase-tools deploy --only hosting`

## NEXT STEPS
1.  **Run Build**: I will run `npm run build` to verify there are no errors.
2.  **Create Config**: I will create `firebase.json` and `.firebaserc` for you.
3.  **Instruct**: You will need to run the final deploy command manually since it requires authentication.
