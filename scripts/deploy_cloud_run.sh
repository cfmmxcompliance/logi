#!/bin/bash

# Configuration
PROJECT_ID="logimaster-cfmoto"
SERVICE_NAME="logimaster-app"
REGION="us-central1"

echo "🚀 Starting Deployment to Google Cloud Run..."
echo "---------------------------------------------"
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region:  $REGION"
echo "---------------------------------------------"

# 1. Configuration & Paths
export CLOUDSDK_PYTHON="/opt/homebrew/bin/python3"
GCLOUD_BIN="/opt/homebrew/share/google-cloud-sdk/bin/gcloud"

# 2. Check for gcloud
if [ ! -f "$GCLOUD_BIN" ]; then
    echo "❌ Error: 'gcloud' binary not found at $GCLOUD_BIN"
    echo "👉 Please verify installation."
    exit 1
fi

echo "✅ Found gcloud: $GCLOUD_BIN"

# 3. Set Project
echo "⚙️  Setting Google Cloud Project..."
"$GCLOUD_BIN" config set project $PROJECT_ID

# 4. Build & Submit Container
echo "📦 Building Docker Image (Cloud Build)..."
"$GCLOUD_BIN" builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME .

# 5. Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
"$GCLOUD_BIN" run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080

echo "---------------------------------------------"
echo "✅ Deployment Complete!"
