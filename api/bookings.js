// Using JSONBin.io for free, persistent storage
// Setup: 1. Go to jsonbin.io and create free account
//        2. Create a new bin with initial data: []
//        3. Copy your bin ID and replace BIN_ID below
//        4. Copy your X-Master-Key and replace the key below
const JSONBIN_API_URL = 'https://api.jsonbin.io/v3/b';
const BIN_ID = '676644dde41b4d34e461b8b2'; // Replace with your bin ID
const MASTER_KEY = '$2a$10$8vKrQ9xwEYmJ7bGT.sB9DeWqN6.cIJTCFzV8hHzP2V8nFjEoB3.Q2'; // Replace with your master key

// Read bookings from JSONBin.io
async function readBookings() {
  try {
    const response = await fetch(`${JSONBIN_API_URL}/${BIN_ID}/latest`, {
      method: 'GET',
      headers: {
        'X-Master-Key': MASTER_KEY
      }
    });

    if (!response.ok) {
      console.error('Failed to read from JSONBin:', response.status);
      return [];
    }

    const data = await response.json();
    return data.record || [];
  } catch (error) {
    console.error('Error reading bookings:', error);
    return [];
  }
}

// Write bookings to JSONBin.io
async function writeBookings(bookings) {
  try {
    const response = await fetch(`${JSONBIN_API_URL}/${BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': MASTER_KEY
      },
      body: JSON.stringify(bookings)
    });

    if (!response.ok) {
      console.error('Failed to write to JSONBin:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error writing bookings:', error);
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
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        status: 'pending',
        ...req.body
      };

      const bookings = await readBookings();
      bookings.push(booking);

      const success = await writeBookings(bookings);
      if (!success) {
        return res.status(500).json({ error: 'Failed to save booking' });
      }

      return res.status(201).json({ success: true, id: booking.id });
    }

    if (req.method === 'GET') {
      // Get all bookings (admin only - add auth later)
      const bookings = await readBookings();
      // Sort by timestamp (newest first)
      bookings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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

      const success = await writeBookings(bookings);
      if (!success) {
        return res.status(500).json({ error: 'Failed to update booking' });
      }

      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}