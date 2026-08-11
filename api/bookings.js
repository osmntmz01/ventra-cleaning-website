const BOOKINGS_KEY = 'ventra:bookings';
const NOTIFICATION_EMAIL = process.env.BOOKING_NOTIFICATION_EMAIL || 'osmntmz@hotmail.com';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Ventra Cleaning <onboarding@resend.dev>';

const memoryBookings = [];
const timeOptions = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM'];
const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function storageConfigError() {
  const error = new Error('Booking storage is not configured');
  error.statusCode = 500;
  return error;
}

async function kvCommand(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`KV request failed with ${response.status}`);
  }

  return response.json();
}

function hasKvConfig() {
  return Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

async function readBookings() {
  const result = await kvCommand(['GET', BOOKINGS_KEY]);
  if (!result) {
    if (isProduction) throw storageConfigError();
    return memoryBookings;
  }
  if (!result.result) return [];

  try {
    const parsed = JSON.parse(result.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBookings(bookings) {
  const result = await kvCommand(['SET', BOOKINGS_KEY, JSON.stringify(bookings)]);
  if (!result) {
    if (isProduction) throw storageConfigError();
    memoryBookings.length = 0;
    memoryBookings.push(...bookings);
  }
}

function getBookingDuration(booking) {
  const duration = Number(booking.durationHours || booking.totalTime || 1);
  return Number.isFinite(duration) && duration > 0 ? Math.max(duration, 2) : 2;
}

function hasBookingConflict(bookings, nextBooking) {
  const nextStart = timeOptions.indexOf(nextBooking.time);
  if (nextStart === -1) return false;

  const nextEnd = nextStart + getBookingDuration(nextBooking);

  return bookings.some((booking) => {
    if (booking.date !== nextBooking.date || booking.status === 'rejected') return false;

    const start = timeOptions.indexOf(booking.time);
    if (start === -1) return false;

    const end = start + getBookingDuration(booking);
    return nextStart < end && nextEnd > start;
  });
}

function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

async function sendBookingNotification(booking) {
  const travelSurcharge = Number(booking.distanceSurcharge || booking.travelSurcharge || 0);
  const totalPrice = Number(booking.price || booking.totalPrice || 0);
  const services = Array.isArray(booking.services) ? booking.services.join(' + ') : booking.service;
  const location = booking.location === 'mobile' ? 'Mobile service' : 'Drop-off';
  const servicePrice = Number(booking.servicePrice || totalPrice - travelSurcharge);
  const subject = `New Ventra Booking - ${services}`;
  const message = `
New booking received:

Name: ${booking.name}
Phone: ${booking.phone}
Email: ${booking.email || 'Not provided'}
Service: ${services}
Date: ${booking.date}
Time: ${booking.time}
Location: ${location}
Address: ${booking.address || 'Drop-off'}
Service price: $${servicePrice}
Travel: $${travelSurcharge}
Total: $${totalPrice}
Issue: ${booking.issue || 'Not provided'}

Booking ID: ${booking.id}
  `.trim();

  if (process.env.RESEND_API_KEY) {
    const emailPayload = {
      from: RESEND_FROM_EMAIL,
      to: [NOTIFICATION_EMAIL],
      subject,
      text: message
    };

    if (isValidEmail(booking.email)) {
      emailPayload.reply_to = booking.email.trim();
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!response.ok) {
      throw new Error(`Resend email failed with ${response.status}: ${await response.text()}`);
    }

    return;
  }

  const formData = new URLSearchParams({
    _subject: subject,
    _template: 'table',
    _captcha: 'false',
    name: booking.name,
    phone: booking.phone,
    email: booking.email || 'not-provided@ventracleaning.com.au',
    service: services,
    date: booking.date,
    time: booking.time,
    location,
    address: booking.address || 'Drop-off',
    service_price: `$${servicePrice}`,
    travel: `$${travelSurcharge}`,
    total: `$${totalPrice}`,
    issue: booking.issue || 'Not provided',
    booking_id: String(booking.id),
    message
  });

  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(NOTIFICATION_EMAIL)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: formData.toString()
  });

  if (!response.ok) {
    throw new Error(`FormSubmit email failed with ${response.status}: ${await response.text()}`);
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const bookings = await readBookings();
      const booking = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        ...req.body,
        status: 'pending'
      };

      if (!booking.name || !booking.phone || !booking.date || !booking.time || !booking.service) {
        return res.status(400).json({ error: 'Missing required booking details' });
      }

      if (hasBookingConflict(bookings, booking)) {
        return res.status(409).json({ error: 'This time is no longer available' });
      }

      bookings.push(booking);
      await writeBookings(bookings);

      try {
        await sendBookingNotification(booking);
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
        // Continue anyway - booking is still valid
      }

      return res.status(201).json({
        success: true,
        id: booking.id,
        booking,
        persistent: hasKvConfig()
      });
    }

    if (req.method === 'GET') {
      const bookings = await readBookings();
      bookings.sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));
      return res.status(200).json({ bookings, persistent: hasKvConfig() });
    }

    if (req.method === 'PATCH') {
      const { id, status } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      if (status && !['pending', 'approved', 'confirmed', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid booking status' });
      }

      const bookings = await readBookings();
      const booking = bookings.find((item) => String(item.id) === String(id));

      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      if (status) {
        booking.status = status;
      } else if (req.body?.action === 'update_pricing') {
        const allowedFields = ['price', 'total', 'totalPrice', 'servicePrice', 'originalPrice', 'distanceSurcharge', 'travelSurcharge', 'distanceKm'];
        for (const field of allowedFields) {
          if (Object.prototype.hasOwnProperty.call(req.body, field)) {
            const value = Number(req.body[field]);
            if (!Number.isFinite(value) || value < 0) {
              return res.status(400).json({ error: `Invalid ${field}` });
            }
            booking[field] = value;
          }
        }
      } else {
        return res.status(400).json({ error: 'Missing status or update action' });
      }

      booking.updatedAt = new Date().toISOString();
      await writeBookings(bookings);

      return res.status(200).json({ success: true, booking });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      const bookings = await readBookings();
      const nextBookings = bookings.filter((item) => String(item.id) !== String(id));

      if (nextBookings.length === bookings.length) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      await writeBookings(nextBookings);
      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    if (error.statusCode === 500 && error.message === 'Booking storage is not configured') {
      return res.status(500).json({
        error: 'Booking storage is not configured',
        persistent: false
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}
