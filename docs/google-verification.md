# Google verification for Gmail access

InfluenceFlow asks for `gmail.readonly` (restricted scope) and `gmail.send` (sensitive scope). That's why Google shows the "unverified app" warning, and why tokens for apps in **Testing** expire after 7 days.

## Just you and your team (≤ 100 people)

1. In Google Auth Platform → **Audience**, set the user type to **External** and the status to **In production**.
2. When you connect, Google shows "Google hasn't verified this app". Click **Advanced → Go to InfluenceFlow (unsafe)**, then tick both Gmail boxes.
3. Tokens no longer expire every 7 days. The limit is 100 users in total.

## Everyone (public launch)

1. **Domain.** Buy one (for example `influenceflow.app`) and point the app at it. Verify it in Google Search Console with the same Google account. Then add it under Branding → Authorized domains.
2. **Branding.** You need:
   - an app name and a 120×120 logo
   - a homepage on your domain that explains what the app does
   - a privacy policy: `/#/privacy` already includes the Gmail and Limited Use disclosure
   - terms of service
3. **Data access.** List exactly these scopes:
   - `openid`
   - `email`
   - `gmail.readonly`
   - `gmail.send`

   Write a one-line reason for each. For example, readonly: "Match emails to the user's CRM contacts to update their status and follow-up reminders, and suggest inbound sponsorship leads." send: "Send and follow up from the CRM in the same Gmail thread, only when the user presses Send."
4. **Demo video** (unlisted YouTube). It should show:
   - the consent screen, with the URL bar visible
   - each scope being used: a status changing after an email, an inbound lead appearing, sending from the CRM
   - disconnecting
5. **Security assessment (CASA).** `gmail.readonly` is restricted, so Google requires a yearly CASA Tier 2 assessment from an authorized lab. It costs money. Budget for it and check current prices with the labs Google lists.
6. Submit in **Verification Center** and answer Google's emails quickly. It usually takes weeks.
