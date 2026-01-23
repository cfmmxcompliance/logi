# Deployment Rules

1. **PRIMARY TARGET**: Every deployment MUST target the Firebase Hosting environment: `https://logimaster-cfmoto.web.app`.
2. **DEPLOYMENT COMMAND**: Always use `firebase deploy --only hosting --project logimaster-cfmoto`.
3. **NO REDUNDANT SERVICES**: Avoid deploying to Cloud Run or GCR unless explicitly asked for a specific backend microservice. The web interface MUST always reside on Firebase Hosting.
4. **BUILD REQUIREMENT**: A successful `npm run build` must precede every deployment.
