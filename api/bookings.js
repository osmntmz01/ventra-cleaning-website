import { promises as fs } from 'fs';
import path from 'path';

const BOOKINGS_FILE = '/tmp/bookings.json';

// Initialize bookings file if it doesn't exist
async function initBookings() {
  try {
    await fs.access(BOOKINGS_FILE);
  } catch {
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify([]));
  }
}

// Read bookings from file
async function readBookings() {
  await initBookings();
  const data = await fs.readFile(BOOKINGS_FILE, 'utf8');
  return JSON.parse(data);
}

// Write bookings to file
async function writeBookings(bookings) {
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
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
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        status: 'pending',
        ...req.body
      };

      const bookings = await readBookings();
      bookings.push(booking);
      await writeBookings(bookings);

      return res.status(201).json({ success: true, id: booking.id });
    }

    if (req.method === 'GET') {
      // Get all bookings (admin only - add auth later)
      const bookings = await readBookings();
      return res.status(200).json(bookings);
    }

    if (req.method === 'PATCH') {
      // Update booking status
      const { id, status } = req.query;

      if (!id || !status || !['pending', 'confirmed', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid id or status' });
      }

      const bookings = await readBookings();
      const bookingIndex = bookings.findIndex(b => b.id === id);

      if (bookingIndex === -1) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      bookings[bookingIndex].status = status;
      bookings[bookingIndex].updatedAt = new Date().toISOString();
      await writeBookings(bookings);

      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}