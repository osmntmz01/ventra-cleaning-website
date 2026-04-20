// Enhanced version with Vercel KV support
// To use this version:
// 1. Install @vercel/kv: npm install @vercel/kv
// 2. Set up KV database in Vercel dashboard
// 3. Replace api/bookings.js with this file

import { kv } from '@vercel/kv';

const BOOKINGS_KEY = 'ventra:bookings';

// Read bookings from KV
async function readBookings() {
  try {
    const bookings = await kv.get(BOOKINGS_KEY);
    return bookings || [];
  } catch (error) {
    console.error('Error reading bookings from KV:', error);
    return [];
  }
}

// Write bookings to KV
async function writeBookings(bookings) {
  try {
    await kv.set(BOOKINGS_KEY, bookings);
    return true;
  } catch (error) {
    console.error('Error writing bookings to KV:', error);
    return false;
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Create new booking
      const booking = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        status: 'pending',
        ...req.body
      };

      // Basic validation
      const required = ['service', 'name', 'phone', 'email', 'date', 'time', 'issue'];
      for (const field of required) {
        if (!booking[field]) {
          return res.status(400).json({ error: `Missing required field: ${field}` });
        }
      }

      const bookings = await readBookings();
      bookings.push(booking);

      const success = await writeBookings(bookings);
      if (!success) {
        return res.status(500).json({ error: 'Failed to save booking' });
      }

      // In a real app, you might send confirmation emails here
      // await sendConfirmationEmail(booking);

      return res.status(201).json({
        success: true,
        id: booking.id,
        message: 'Booking created successfully'
      });
    }

    if (req.method === 'GET') {
      // Get all bookings (admin only - add proper auth in production)
      const bookings = await readBookings();

      // Sort by timestamp (newest first)
      bookings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return res.status(200).json(bookings);
    }

    if (req.method === 'PATCH') {
      // Update booking status
      const { id, status } = req.query;

      if (!id || !status) {
        return res.status(400).json({ error: 'Missing id or status parameter' });
      }

      if (!['pending', 'confirmed', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: pending, confirmed, or rejected' });
      }

      const bookings = await readBookings();
      const bookingIndex = bookings.findIndex(b => b.id === id);

      if (bookingIndex === -1) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      bookings[bookingIndex].status = status;
      bookings[bookingIndex].updatedAt = new Date().toISOString();

      const success = await writeBookings(bookings);
      if (!success) {
        return res.status(500).json({ error: 'Failed to update booking' });
      }

      // In a real app, you might send status update emails here
      // await sendStatusUpdateEmail(bookings[bookingIndex]);

      return res.status(200).json({
        success: true,
        booking: bookings[bookingIndex],
        message: `Booking ${status} successfully`
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Please try again later'
    });
  }
}