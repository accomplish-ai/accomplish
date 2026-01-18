# Openwork Release Bot - Cloudflare Worker

Receives Slack button clicks and triggers GitHub release workflow.

## How It Works

1. User clicks release button in Slack
2. Slack POSTs to this Worker
3. Worker verifies Slack signature
4. Worker triggers GitHub workflow via API
5. Worker responds to Slack with confirmation

## Deployment

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- GitHub Personal Access Token with `repo` and `workflow` scopes

### Steps

1. **Install Wrangler CLI:**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Get your Cloudflare Account ID:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Select your account
   - Copy the Account ID from the URL or sidebar

4. **Add secrets:**
   ```bash
   cd infrastructure/cloudflare-worker

   # Set your account ID (required for all wrangler commands)
   export CLOUDFLARE_ACCOUNT_ID=your_account_id_here

   # Slack signing secret (from Slack App → Basic Information → Signing Secret)
   wrangler secret put SLACK_SIGNING_SECRET

   # GitHub PAT (with repo and workflow scopes)
   wrangler secret put GITHUB_TOKEN
   ```

5. **Deploy:**
   ```bash
   CLOUDFLARE_ACCOUNT_ID=your_account_id wrangler deploy
   ```

6. **Note the Worker URL** from the output, e.g.:
   ```
   https://openwork-release-bot.<your-subdomain>.workers.dev
   ```

7. **Configure Slack App:**
   - Go to your Slack App → Interactivity & Shortcuts
   - Toggle ON "Interactivity"
   - Set Request URL to your Worker URL
   - Save Changes

## Testing

Trigger the release-reminder workflow, then click one of the buttons in Slack.
You should see:
1. Confirmation message in Slack: "🔧 Patch release triggered by @user! Building..."
2. Release workflow starts in GitHub Actions

## Troubleshooting

**"Invalid signature" error:**
- Verify SLACK_SIGNING_SECRET matches Slack App → Basic Information → Signing Secret

**"Failed to trigger release" error:**
- Verify GITHUB_TOKEN has `repo` and `workflow` scopes
- Verify token hasn't expired

**Logs:**
```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id wrangler tail
```

## Security

- All requests are verified using Slack's HMAC-SHA256 signature
- Timestamps are checked to prevent replay attacks (5 min window)
- Secrets are stored encrypted in Cloudflare
