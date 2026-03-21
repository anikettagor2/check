# WhatsApp API Production Troubleshooting Guide

**Issue**: WhatsApp messages work on local system but fail when site goes live.

---

## 🔴 COMMON PRODUCTION ISSUES & FIXES

### 1. **API KEY NOT PROPERLY SET IN PRODUCTION ENVIRONMENT**

**Problem**: `AISENSY_API_KEY` is undefined on production servers.

**Solution**:

- ✅ Verify `.env.local` contains the API key locally
- ✅ Add `AISENSY_API_KEY` to Vercel/hosting platform environment variables
- ✅ Restart the server after adding environment variables
- ✅ Check if the key is being read: Add logging to `src/lib/whatsapp.ts` line 246

```typescript
// Add this debug log at the top of sendWhatsAppNotification()
if (!AISENSY_API_KEY) {
  console.error(
    "[WhatsApp] CRITICAL: AISENSY_API_KEY is missing from environment",
  );
  return { success: false, error: "WhatsApp service not configured" };
}
```

---

### 2. **PHONE NUMBER FORMAT ISSUES**

**Problem**: Phone numbers in database are in wrong format or invalid.

**Solution**:

- ✅ Ensure all phone numbers in Firestore are **10-digit Indian numbers WITHOUT country code**
  - ✅ Valid: `9876543210` → Gets converted to `919876543210`
  - ❌ Invalid: `+919876543210`, `+1-234-567-8900`, `919876543210`
- ✅ Check users in Firestore:

  ```
  Collection: users
  Fields to verify:
  - whatsappNumber: Should be 10 digits or empty
  - phoneNumber: Fallback if whatsappNumber empty
  ```

- ✅ Update phone number formatting in code if needed:
  ```typescript
  // In formatPhoneNumber() function - lines 78-91
  // Handles these formats:
  // • 10 digits (India): "9876543210" → "919876543210"
  // • 12 digits: "919876543210" → "919876543210"
  // • 11 digits: "09876543210" → "919876543210"
  // • 13 digits: "0919876543210" → "919876543210"
  ```

---

### 3. **DNS RESOLUTION FAILURE (ENOTFOUND)**

**Problem**: Error message shows `Error: getaddrinfo ENOTFOUND backend.aisensy.com`

This is a **production network connectivity issue** - the server cannot resolve the domain name.

**Error Details**:
```
[WhatsApp] Network Error: TypeError: fetch failed
  errno: -3008
  code: 'ENOTFOUND'
  syscall: 'getaddrinfo'
  hostname: 'backend.aisensy.com'
```

**Solution**: Check in this order:

1. ✅ **Verify DNS is working** - Test from your production platform:
   - If on Vercel: Use Vercel's serverless logs to check network requests
   - If on Firebase: Check Cloud Functions network configuration
   - If on custom server: Run `nslookup backend.aisensy.com` from production environment

2. ✅ **Check Firewall/Network Policies**:
   - Production server may block outbound HTTPS requests
   - Contact hosting provider to allow HTTPS traffic to `backend.aisensy.com:443`
   - Common platforms with restrictions:
     - **Vercel**: Check for VPN requirement or blocked domains
     - **Firebase Cloud Functions**: May need to use `blaze` plan for external APIs
     - **AWS Lambda**: Check VPC/security group rules

3. ✅ **Enable Detailed Error Logging** (code already updated):
   - Build includes enhanced error handling for ENOTFOUND
   - Check logs for: `Network Error - Domain Resolution Failed`
   - Information provided: hostname, solution steps, error details

4. ✅ **Test Endpoint Availability**:
   ```typescript
   // Add this test endpoint to verify connectivity
   // GET /api/health/whatsapp-connectivity
   const response = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ test: true })
   });
   ```

5. ✅ **As Last Resort - Use Proxy/VPN**:
   - If your hosting provider blocks direct access
   - Configure proxy server in AiSensy API request
   - Or enable VPN in hosting platform

---

### 4. **NETWORK TIMEOUT OR BLOCKED REQUESTS**

**Problem**: Requests to AiSensy API timeout or get blocked by firewall.

**Solution**:

- ✅ Check firewall allows outbound HTTPS to `https://backend.aisensy.com`
- ✅ Verify 10-second timeout is sufficient: `src/lib/whatsapp.ts` line 189

  ```typescript
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds
  // If needed, increase to 15000 (15 seconds) for slow networks
  ```

- ✅ Enable production logging to inspect network issues:
  ```typescript
  // In functions/src/index.ts - add detailed logging
  console.error(
    "[WhatsApp] Response status:",
    response.status,
    response.statusText,
  );
  console.error("[WhatsApp] Response body:", await response.text());
  ```

---

### 5. **GLOBAL WHATSAPP NOTIFICATIONS DISABLED**

**Problem**: Admin has disabled notifications in settings.

**Solution**:

- ✅ Check Firebase: `settings/whatsapp` document
  - Check if `enabled: false` is set
  - Check if specific notification types have `enabled: false`
- ✅ Enable in admin dashboard:
  - Navigate to Settings → WhatsApp
  - Toggle "Global WhatsApp Notifications" to ON
  - Ensure specific triggers are enabled

---

### 6. **FIREBASE ADMIN SDK NOT INITIALIZED**

**Problem**: Cloud Functions can't access Firestore.

**Solution**:

- ✅ Verify `FIREBASE_PRIVATE_KEY` and `FIREBASE_CLIENT_EMAIL` are set in `.env.local`
- ✅ Check Service Account JSON is valid: `functions/src/index.ts` line 8-9

  ```typescript
  // Should initialize without errors
  process.env.FIREBASE_CLIENT_EMAIL;
  process.env.FIREBASE_PRIVATE_KEY;
  ```

- ✅ Test Firebase connection in cloud function logs:
  ```
  Search Vercel/hosting logs for:
  "Firebase Admin initialized" - means it's working
  "Error initializing Firebase" - means there's a configuration issue
  ```

---

### 7. **AISENSY CAMPAIGN NAME MISMATCH**

**Problem**: Campaign names don't match what's registered in AiSensy.

**Solution**:

- ✅ Verify campaign names in AiSensy account match:
  - `("CLIENT", "EDITOR", "PROJECT_MANAGER")`
- ✅ Check Firebase `settings/whatsapp` has correct campaigns:

  ```typescript
  {
    "campaigns": {
      "client": "CLIENT",      // Must match AiSensy
      "editor": "EDITOR",      // Must match AiSensy
      "pm": "PROJECT_MANAGER"  // Must match AiSensy
    }
  }
  ```

- ✅ Get correct campaign names from AiSensy dashboard

---

### 8. **WHATSAPP TEMPLATES NOT APPROVED**

**Problem**: AiSensy is rejecting messages because templates aren't approved.

**Solution**:

- ✅ Go to AiSensy account → Templates section
- ✅ Ensure these templates are APPROVED:
  - CLIENT template
  - EDITOR template
  - PROJECT_MANAGER template

- ✅ Check template parameters match what code sends:
  - Code sends 3 params: `[name, message, projectName]`
  - Template must accept exactly 3 params: `{1}`, `{2}`, `{3}`

- ✅ If templates are rejected:
  1. Create new templates with correct parameters
  2. Update campaign names in admin settings
  3. Deploy code with new campaign names

---

### 9. **WHATSAPP API RATE LIMITING**

**Problem**: Too many requests causing timeout/rejection.

**Solution**:

- ✅ Check AiSensy rate limits (usually 100+ msgs/min)
- ✅ Implement exponential backoff (already in code):
  ```typescript
  // src/lib/whatsapp.ts - Lines 203-210
  if (retryCount < MAX_RETRIES) {
    await delay(RETRY_DELAY * (retryCount + 1)); // 1s, 2s, 3s retry delays
    return sendWhatsAppNotification(..., retryCount + 1);
  }
  ```

---

### 10. **WRONG MESSAGE SENT (Custom vs Default)**

**Problem**: Users receiving default message instead of custom message.

**Solution**:

- ✅ Check `settings/whatsapp` has custom message saved:

  ```
  notifications: {
    "client_project_created": {
      "enabled": true,
      "message": "Your custom message here"
    }
  }
  ```

- ✅ If message is empty, code uses DEFAULT_MESSAGE (lines 37-50)
- ✅ Go to Admin Dashboard → Settings → WhatsApp → Edit custom messages

---

## 🟢 VERIFICATION CHECKLIST

**Before pushing to production, verify:**

```
[ ] AISENSY_API_KEY is in Vercel/hosting environment variables
[ ] All user phone numbers are 10 digits (without country code)
[ ] Firebase admin credentials are set (FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL)
[ ] whatsapp/settings document exists with enabled: true
[ ] Campaign names match AiSensy registered campaigns
[ ] WhatsApp templates are APPROVED in AiSensy
[ ] No firewall blocking outbound HTTPS to backend.aisensy.com
[ ] Retry logic ensures failed messages are retried 3 times
[ ] Cloud functions have proper error logging enabled
[ ] Phone numbers are being saved correctly in Firestore (whatsappNumber field)
```

---

## 📊 TESTING IN PRODUCTION

### Test 1: Verify API Key is Loaded

1. Call any endpoint that sends WhatsApp
2. Check cloud function logs for: `[WhatsApp] Attempting send to...`
3. If you see: `AISENSY_API_KEY is missing` → Environment variable not set

### Test 2: Test Phone Number Validation

1. Create a user with phone number `9876543210`
2. Trigger a notification
3. Logs should show: `[WhatsApp] Attempting send to 919876543210`

### Test 3: Monitor AiSensy Response

1. Send test notification
2. Check logs for response:
   - ✅ Success: `[WhatsApp] Success: { message: "Sent" }`
   - ❌ Error: `[WhatsApp] AiSensy Error: { ... }`

### Test 4: Check Firestore Logging

1. Notifications should create cloud function logs
2. Search Vercel logs for `[WhatsApp]` prefix
3. All attempts should be logged (even failures for debugging)

---

## 🔧 QUICK DEBUG STEPS

**If messages aren't being sent:**

1. **Check API Key first** (most common issue):

   ```bash
   # In Vercel dashboard, verify env var:
   AISENSY_API_KEY = eyJhbGc...
   ```

2. **Check phone numbers**:

   ```
   Firebase Console → Firestore → users collection
   Are phone numbers in column: whatsappNumber or phoneNumber?
   Format: must be 10 digits or empty
   ```

3. **Check settings**:

   ```
   Firebase Firestore → settings → whatsapp
   enabled: true ?
   notifications → [notification_type] → enabled: true ?
   ```

4. **Check cloud function logs**:

   ```
   Vercel Logs → Filter by [WhatsApp]
   Look for error messages and response codes
   ```

5. **Test with curl**:
   ```bash
   curl -X POST https://backend.aisensy.com/campaign/t1/api/v2 \
     -H "Content-Type: application/json" \
     -d '{
       "apiKey": "YOUR_KEY",
       "campaignName": "CLIENT",
       "destination": "919876543210",
       "templateParams": ["Name", "Message", "ProjectName"]
     }'
   ```

---

## ⚠️ CRITICAL NOTES

- **Local Works but Production Doesn't** = Environment variable issue (99% of the time)
- **Retry Logic Ensures Resilience** = Failures are automatically retried 3 times with exponential backoff
- **Phone Number Validation is Strict** = Invalid formats will silently fail (see logs)
- **Settings Override Defaults** = Admin dashboard settings take precedence over hardcoded messages

---

**Last Updated**: March 20, 2026
**API Provider**: AiSensy (backend.aisensy.com)
**Support**: Check Vercel logs with filter `[WhatsApp]` for detailed debugging
