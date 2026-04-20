# Ventra Cleaning - Booking System

A complete booking system for the Ventra Cleaning website with serverless backend and admin panel.

## Features

- **Customer Booking Form**: Integrated into the main website
- **Serverless API**: POST, GET, and PATCH endpoints for bookings
- **Admin Panel**: Login-protected dashboard for managing bookings
- **Real-time Status Updates**: Confirm/reject bookings with instant UI updates
- **Responsive Design**: Works on desktop and mobile
- **Storage Options**: File-based (default) or Vercel KV (recommended for production)

## Quick Start

1. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

2. **Access Admin Panel**:
   - Visit: `https://your-domain.com/admin`
   - Username: `admin`
   - Password: `ventra2026`

3. **Test Booking Form**:
   - Fill out the booking form on the main website
   - Check the admin panel to see new bookings

## API Endpoints

### POST `/api/bookings`
Create a new booking.

**Request Body**:
```json
{
  "service": "Ozone Treatment",
  "price": 100,
  "duration": 1,
  "locationType": "mobile",
  "address": "123 Collins St, Melbourne VIC",
  "date": "2024-04-25",
  "time": "10:00 AM",
  "name": "John Smith",
  "phone": "0412345678",
  "email": "john@example.com",
  "issue": "Cigarette smell in car"
}
```

**Response**:
```json
{
  "success": true,
  "id": "1713998400123abc"
}
```

### GET `/api/bookings`
Get all bookings (admin only).

**Response**:
```json
[
  {
    "id": "1713998400123abc",
    "timestamp": "2024-04-25T02:00:00.123Z",
    "status": "pending",
    "service": "Ozone Treatment",
    "name": "John Smith",
    // ... other booking fields
  }
]
```

### PATCH `/api/bookings?id={id}&status={status}`
Update booking status.

**Parameters**:
- `id`: Booking ID
- `status`: `pending`, `confirmed`, or `rejected`

**Response**:
```json
{
  "success": true
}
```

## Production Setup (Recommended)

For production use, upgrade to Vercel KV for reliable data persistence:

### 1. Install Vercel KV

```bash
npm install @vercel/kv
```

### 2. Set up KV Database

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Storage tab
4. Create a new KV database
5. Connect it to your project

### 3. Upgrade API

Replace `api/bookings.js` with `api/bookings-kv.js`:

```bash
mv api/bookings-kv.js api/bookings.js
```

### 4. Redeploy

```bash
vercel --prod
```

## Security Considerations

For production use:

1. **Change Admin Credentials**: Update username/password in `admin.html`
2. **Add Authentication**: Implement proper session management
3. **Rate Limiting**: Add rate limiting to prevent spam bookings
4. **Input Validation**: Add server-side validation for all fields
5. **HTTPS Only**: Ensure all traffic uses HTTPS

## File Structure

```
ventra-cleaning/
├── index.html              # Main website
├── admin.html              # Admin dashboard
├── api/
│   ├── bookings.js         # Serverless API (file storage)
│   └── bookings-kv.js      # Enhanced API (Vercel KV)
├── package.json
├── vercel.json             # Vercel configuration
└── README.md
```

## Admin Panel Features

- **Dashboard Stats**: View totals for all booking statuses
- **Filter & Sort**: Filter by status, sorted by newest first
- **Booking Details**: Complete customer information and service details
- **Status Management**: One-click confirm/reject buttons
- **Responsive Design**: Works on mobile and desktop

## Customization

### Update Services
Edit the service options in `index.html` around line 1100:

```html
<div class="svc-chip" data-name="Your Service" data-price="150" data-duration="2">
  <div class="svc-chip-name">🔧 Your Service</div>
  <div class="svc-chip-price">$150 · 2 hours</div>
</div>
```

### Change Travel Zones
Update the distance calculations in `index.html` around line 1340:

```javascript
if (dist <= 3) { travel = 0; }
else if (dist <= 10) { travel = 25; }
else if (dist <= 40) { travel = 50; }
```

### Email Notifications
Add email sending functionality to the API using services like:
- Resend
- SendGrid
- Postmark

## Support

For issues or questions about the booking system:
1. Check the browser console for error messages
2. Verify API endpoints are working: `/api/bookings`
3. Check Vercel function logs for server errors

## License

This booking system is custom-built for Ventra Cleaning.